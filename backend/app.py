import json
import math
import os
import re
import secrets
import unicodedata
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple
from uuid import uuid4
from urllib.parse import urljoin, urlparse

import bcrypt
import resend
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
    verify_jwt_in_request,
)
from flask_pymongo import PyMongo
from bson import ObjectId
from bson.errors import InvalidId
from werkzeug.utils import secure_filename

load_dotenv()

_resend_api_key = (os.getenv("RESEND_API_KEY") or "").strip()
if _resend_api_key:
    resend.api_key = _resend_api_key

_configured_admin_email = os.getenv(
    "DEFAULT_ADMIN_EMAIL", "mihailtsvetanov7@gmail.com"
) or "mihailtsvetanov7@gmail.com"
DEFAULT_ADMIN_EMAIL = _configured_admin_email.strip().lower()
DEFAULT_ADMIN_NAME = (
    os.getenv("DEFAULT_ADMIN_NAME", "Mihail Tsvetanov") or "Mihail Tsvetanov"
).strip()


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)

    # --- Configuration ---
    app.config["JWT_SECRET_KEY"] = os.getenv(
        "JWT_SECRET_KEY", "change-me-in-production"
    )
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)
    app.config["MONGO_URI"] = os.getenv(
        "MONGO_URI", "mongodb://localhost:27017/limeshop"
    )
    max_upload_mb = int(os.getenv("MAX_UPLOAD_SIZE_MB", "16"))
    app.config["MAX_CONTENT_LENGTH"] = max_upload_mb * 1024 * 1024

    upload_directory = os.getenv("PRODUCT_UPLOAD_FOLDER")
    if upload_directory:
        upload_directory = os.path.abspath(upload_directory)
    else:
        upload_directory = os.path.join(app.root_path, "uploads")

    os.makedirs(upload_directory, exist_ok=True)

    app.config["PRODUCT_UPLOAD_FOLDER"] = upload_directory
    app.config["PRODUCT_ALLOWED_EXTENSIONS"] = {"png", "jpg", "jpeg", "gif", "webp"}

    # --- Initialize extensions ---
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    JWTManager(app)
    mongo = PyMongo(app)
    db = mongo.db
    featured_selection_collection = db.featured_products

    email_regex = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    brand_colors = {
        "bg_primary": "#030711",
        "bg_secondary": "#040b18",
        "glass_light": "rgba(18, 33, 25, 0.55)",
        "glass_border": "rgba(175, 255, 179, 0.25)",
        "glass_highlight": "rgba(160, 255, 180, 0.45)",
        "text_primary": "#f5ffe9",
        "text_secondary": "rgba(226, 248, 220, 0.82)",
        "text_muted": "rgba(226, 248, 220, 0.55)",
        "accent_lime": "#a9ff7c",
        "accent_mint": "#73ffc6",
    }
    otp_code_length = 6
    otp_expiration_minutes = 5
    otp_sender_email = (
        os.getenv("OTP_SENDER_EMAIL", "verification@limeshop.store")
        or "verification@limeshop.store"
    )
    otp_email_subject = "Lime Shop • Verify your email"
    max_failed_otp_attempts = 5
    email_verification_collection = db.email_verification_tokens

    try:
        email_verification_collection.create_index(
            "expires_at", expireAfterSeconds=0
        )
    except Exception as exc:
        app.logger.warning(
            "Unable to ensure TTL index for verification codes: %s", exc
        )

    seed_products = [
        {
            "name": "Luminous Lime Elixir",
            "price": 12.5,
            "description": "Sparkling lime nectar infused with basil and cold-pressed citrus oils.",
        },
        {
            "name": "Key Lime Cloud Tart",
            "price": 18.0,
            "description": "Feather-light tart with whipped mascarpone and candied lime zest.",
        },
        {
            "name": "Citrus Grove Bonbons",
            "price": 9.75,
            "description": "Hand painted white chocolate bonbons with a tangy lime curd center.",
        },
        {
            "name": "Verdant Velvet Cheesecake",
            "price": 22.5,
            "description": "Baked lime cheesecake with pistachio crumb and kaffir lime cream.",
        },
        {
            "name": "Glacier Lime Sorbet",
            "price": 6.5,
            "description": "Icy sorbet spun with Tahitian vanilla and crystallized lime peel.",
        },
    ]

    # --- Helpers ---

    ALLOWED_USER_ROLES = {"admin", "seller", "standard"}
    MAX_PRODUCT_VARIATIONS = 25
    FEATURED_SHOWCASE_LIMIT = 4
    FEATURED_SELECTION_ID = "home_showcase_selection"
    SHOWCASE_LABEL_MAX_LENGTH = 60

    def normalize_email(value: Optional[str]) -> str:
        return str(value or "").strip().lower()

    def is_valid_email(value: Optional[str]) -> bool:
        normalized = normalize_email(value)
        return bool(normalized and email_regex.match(normalized))

    def normalize_role(value: Optional[str]) -> str:
        normalized = str(value or "").strip().lower()
        return normalized if normalized in ALLOWED_USER_ROLES else "standard"

    def get_user_role(user_document) -> str:
        if not user_document:
            return "standard"

        email = normalize_email(user_document.get("email"))
        if email == DEFAULT_ADMIN_EMAIL:
            return "admin"

        return normalize_role(user_document.get("role", "standard"))

    def require_role(*roles: str):
        allowed = {normalize_role(role) for role in roles if role}

        current_email = get_jwt_identity()
        current_user = db.users.find_one({"email": current_email})
        user_role = get_user_role(current_user)

        if user_role == "admin" or not allowed or user_role in allowed:
            return current_user, None

        return (
            None,
            (
                jsonify(
                    {"message": "You need additional permissions to perform this action."}
                ),
                403,
            ),
        )

    def require_admin_user():
        return require_role("admin")

    def generate_otp_code(length: int = otp_code_length) -> str:
        upper_bound = 10**length
        return f"{secrets.randbelow(upper_bound):0{length}d}"

    def persist_verification_code(email: str, otp: str) -> datetime:
        expires_at = datetime.utcnow() + timedelta(minutes=otp_expiration_minutes)
        hashed_code = bcrypt.hashpw(otp.encode("utf-8"), bcrypt.gensalt())

        email_verification_collection.update_one(
            {"email": email},
            {
                "$set": {
                    "email": email,
                    "otp_hash": hashed_code,
                    "expires_at": expires_at,
                    "created_at": datetime.utcnow(),
                    "failed_attempts": 0,
                }
            },
            upsert=True,
        )

        return expires_at

    def log_otp_failure(email: str, details: str):
        log_message = f"OTP dispatch failed for {email}: {details}"
        app.logger.error(log_message)
        print(f"[OTP][ERROR] {log_message}", flush=True)

    def build_verification_email_html(otp: str) -> str:
        colors = brand_colors
        gradient_overlay = (
            "radial-gradient(circle at 25% -20%, rgba(169,255,124,0.22), transparent 55%),"
            "radial-gradient(circle at 90% 0%, rgba(115,255,198,0.25), transparent 62%),"
            "linear-gradient(145deg, rgba(3,7,17,0.96), rgba(4,11,24,0.92))"
        )
        otp_pill_gradient = (
            f"linear-gradient(120deg, {colors['accent_lime']}, {colors['accent_mint']})"
        )

        return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="color-scheme" content="dark" />
    <title>Lime Shop Email Verification</title>
  </head>
  <body style="margin:0;padding:0;background-color:{colors['bg_primary']};color:{colors['text_primary']};font-family:'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif;">
    <div style="padding:48px 16px;background-color:{colors['bg_primary']};background-image:radial-gradient(circle at 18% 10%, rgba(169,255,124,0.12), transparent 60%),radial-gradient(circle at 80% 0%, rgba(115,255,198,0.12), transparent 55%);">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;margin:0 auto;border-radius:32px;overflow:hidden;background:{colors['bg_secondary']};border:1px solid {colors['glass_border']};box-shadow:0 32px 80px rgba(2, 6, 14, 0.78);">
        <tr>
          <td style="padding:48px 42px;background-image:{gradient_overlay};background-size:cover;">
            <p style="margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.4em;font-size:12px;color:{colors['accent_mint']};">Lime Shop</p>
            <h1 style="margin:0 0 14px 0;font-size:26px;line-height:1.25;color:{colors['text_primary']};">Ignite your Lime Shop account</h1>
            <p style="margin:0 0 28px 0;font-size:15px;line-height:1.75;color:{colors['text_secondary']};">
              We pair handcrafted citrus goods with neon energy. Enter the code below to prove this inbox belongs to you
              and finish creating your account. The code is valid for {otp_expiration_minutes} minutes.
            </p>
            <div style="background:{colors['glass_light']};border:1px solid {colors['glass_border']};border-radius:26px;padding:28px;text-align:center;box-shadow:0 25px 65px rgba(3,7,17,0.65);">
              <p style="margin:0 0 16px 0;text-transform:uppercase;letter-spacing:0.3em;font-size:12px;color:{colors['text_muted']};">Verification code</p>
              <span style="display:inline-block;padding:18px 32px;border-radius:18px;font-size:36px;letter-spacing:0.4em;font-weight:700;background:{otp_pill_gradient};color:{colors['bg_secondary']};text-shadow:0 8px 18px rgba(3,7,17,0.4);">
                {otp}
              </span>
              <p style="margin:18px 0 0 0;font-size:13px;color:{colors['text_secondary']};">Expires {otp_expiration_minutes} minutes after this email was sent</p>
            </div>
            <div style="margin-top:32px;padding:0;">
              <p style="margin:0 0 12px 0;font-size:14px;color:{colors['text_secondary']};">Need a refresher?</p>
              <ol style="margin:0;padding-left:18px;color:{colors['text_secondary']};line-height:1.8;font-size:14px;">
                <li>Return to the Lime Shop tab where you requested the code.</li>
                <li>Enter the digits exactly as shown above.</li>
                <li>Continue building your personalized Lime Shop experience.</li>
              </ol>
            </div>
            <p style="margin:32px 0 8px 0;font-size:14px;line-height:1.7;color:{colors['text_muted']};">
              Didn&rsquo;t expect this email? You can safely ignore it—your account stays locked until the correct code is entered.
            </p>
            <p style="margin:0;font-size:13px;color:{colors['text_muted']};">
              With zest,<br />The Lime Shop Team
            </p>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>"""

    def send_verification_email(recipient_email: str, otp: str):
        configured_api_key = getattr(resend, "api_key", None) or _resend_api_key
        if not configured_api_key:
            return False, "RESEND_API_KEY is not configured."

        html_body = build_verification_email_html(otp)
        text_body = (
            f"Your Lime Shop verification code is {otp}. "
            f"Enter it within {otp_expiration_minutes} minutes to confirm this email."
        )

        payload: Dict[str, object] = {
            "from": f"Lime Shop <{otp_sender_email}>",
            "to": [recipient_email],
            "subject": otp_email_subject,
            "html": html_body,
            "text": text_body,
        }

        try:
            response = resend.Emails.send(payload)
        except Exception as exc:
            return False, str(exc)

        if not isinstance(response, dict) or not response.get("id"):
            return False, str(response)

        return True, None

    def dispatch_verification_code(email: str):
        otp = generate_otp_code()
        expires_at = persist_verification_code(email, otp)

        sent, error_details = send_verification_email(email, otp)
        if not sent:
            email_verification_collection.delete_one({"email": email})
            log_otp_failure(email, error_details or "Unknown Resend error")
            return {
                "success": False,
                "error": error_details or "Failed to deliver verification email.",
            }

        return {
            "success": True,
            "expires_at": expires_at,
            "otp_length": otp_code_length,
        }

    def ensure_seed_products():
        if db.products.count_documents({}) > 0:
            return

        timestamp = datetime.utcnow()
        documents = []
        for product in seed_products:
            seed_filenames: List[str] = []
            if isinstance(product.get("image_filenames"), list):
                seed_filenames = [
                    str(filename) for filename in product["image_filenames"] if filename
                ]
            elif product.get("image_filename"):
                seed_filenames = [str(product.get("image_filename"))]

            documents.append(
                {
                    "name": product.get("name", ""),
                    "price": float(product.get("price", 0) or 0),
                    "description": product.get("description", ""),
                    "created_at": timestamp,
                    "created_by": DEFAULT_ADMIN_EMAIL,
                    **(
                        {
                            "image_filenames": seed_filenames,
                            "image_filename": seed_filenames[0],
                        }
                        if seed_filenames
                        else {}
                    ),
                    **(
                        {"image_url": product.get("image_url")}
                        if product.get("image_url")
                        else {}
                    ),
                }
            )

        if documents:
            db.products.insert_many(documents)

    def allowed_image_extension(filename: str) -> bool:
        extension = os.path.splitext(filename)[1].lower().lstrip(".")
        if not extension:
            return False
        return extension in app.config["PRODUCT_ALLOWED_EXTENSIONS"]

    def save_product_image(image_file):
        if not image_file or not getattr(image_file, "filename", ""):
            return None, "An image file is required."

        original_filename = secure_filename(image_file.filename)
        if not original_filename:
            return None, "Please choose a valid file name."

        if not allowed_image_extension(original_filename):
            return (
                None,
                "Unsupported image format. Upload PNG, JPG, JPEG, GIF, or WEBP files.",
            )

        extension = os.path.splitext(original_filename)[1].lower()
        unique_filename = f"{uuid4().hex}{extension}"
        destination = os.path.join(
            app.config["PRODUCT_UPLOAD_FOLDER"], unique_filename
        )

        try:
            image_file.save(destination)
        except OSError:
            return None, "We could not store the uploaded image. Please try again."

        return unique_filename, None

    def save_product_images(image_files):
        saved_filenames: List[str] = []
        if not image_files:
            return saved_filenames, None

        for image_file in image_files:
            if not image_file or not getattr(image_file, "filename", ""):
                continue
            new_filename, image_error = save_product_image(image_file)
            if image_error:
                for filename in saved_filenames:
                    remove_product_image(filename)
                return [], image_error
            saved_filenames.append(new_filename)

        return saved_filenames, None

    def remove_product_image(filename):
        if not filename:
            return

        if isinstance(filename, (list, tuple, set)):
            for item in filename:
                remove_product_image(item)
            return

        target = os.path.join(app.config["PRODUCT_UPLOAD_FOLDER"], str(filename))
        try:
            os.remove(target)
        except FileNotFoundError:
            return
        except OSError:
            return

    def build_upload_url(filename: Optional[str]) -> str:
        if not filename:
            return ""

        sanitized = str(filename).strip()
        if not sanitized:
            return ""

        return urljoin(request.host_url, f"uploads/{sanitized}")

    ADDRESS_FIELDS = ("country", "postcode", "city", "line1", "line2")
    ADDRESS_FIELD_ALIASES = {
        "country": (
            "country",
            "country_name",
            "countryName",
            "address_country",
            "addressCountry",
        ),
        "postcode": (
            "postcode",
            "postal_code",
            "postalCode",
            "zip",
            "zip_code",
            "zipCode",
            "address_postcode",
            "addressPostcode",
        ),
        "city": ("city", "town", "address_city", "addressCity"),
        "line1": (
            "line1",
            "line_1",
            "address_line_1",
            "addressLine1",
            "address1",
            "street",
            "street1",
        ),
        "line2": (
            "line2",
            "line_2",
            "address_line_2",
            "addressLine2",
            "address2",
            "apartment",
            "suite",
        ),
    }
    ADDRESS_REQUIRED_FIELDS = ("country", "postcode", "city", "line1")

    def normalize_address_payload(payload: Optional[Dict]) -> Dict[str, str]:
        if not isinstance(payload, dict):
            return {}

        normalized: Dict[str, str] = {}
        for field in ADDRESS_FIELDS:
            aliases = ADDRESS_FIELD_ALIASES.get(field, (field,))
            value = None
            for alias in aliases:
                if alias in payload:
                    value = payload.get(alias)
                    break
            if value is None:
                continue
            trimmed = str(value).strip()
            if trimmed:
                normalized[field] = trimmed
        return normalized

    def has_any_address_value(payload: Optional[Dict]) -> bool:
        return bool(normalize_address_payload(payload))

    def is_complete_address(payload: Optional[Dict]) -> bool:
        normalized = normalize_address_payload(payload)
        return all(normalized.get(field) for field in ADDRESS_REQUIRED_FIELDS)

    def serialize_address_payload(payload: Optional[Dict]) -> Dict[str, str]:
        normalized = normalize_address_payload(payload)
        return {field: normalized.get(field, "") for field in ADDRESS_FIELDS}

    def serialize_user_profile(user_document) -> Dict[str, str]:
        if not user_document:
            return {}

        verified_at = user_document.get("verified_at")
        return {
            "name": user_document.get("name", "") or "",
            "email": user_document.get("email", "") or "",
            "phone": user_document.get("phone", "") or "",
            "role": get_user_role(user_document),
            "avatar_url": build_upload_url(user_document.get("avatar_filename")),
            "email_verified": bool(user_document.get("email_verified")),
            "verified_at": verified_at.isoformat()
            if isinstance(verified_at, datetime)
            else None,
            "address": serialize_address_payload(user_document.get("address")),
        }

    def serialize_admin_user(user_document) -> Dict[str, str]:
        if not user_document:
            return {}

        created_at = user_document.get("created_at")
        last_login_at = user_document.get("last_login_at")
        verified_at = user_document.get("verified_at")

        return {
            "id": str(user_document.get("_id")),
            "name": user_document.get("name", "") or "",
            "email": user_document.get("email", "") or "",
            "phone": user_document.get("phone", "") or "",
            "role": get_user_role(user_document),
            "created_at": created_at.isoformat() if isinstance(created_at, datetime) else None,
            "last_login_at": last_login_at.isoformat()
            if isinstance(last_login_at, datetime)
            else None,
            "avatar_url": build_upload_url(user_document.get("avatar_filename")),
            "email_verified": bool(user_document.get("email_verified")),
            "verified_at": verified_at.isoformat()
            if isinstance(verified_at, datetime)
            else None,
        }

    def normalize_category_name(value: Optional[str]) -> str:
        if value is None:
            return ""
        condensed = " ".join(str(value).split())
        return condensed.strip()

    def slugify_category_name(value: Optional[str]) -> str:
        normalized_name = normalize_category_name(value).lower()
        ascii_name = (
            unicodedata.normalize("NFKD", normalized_name)
            .encode("ascii", "ignore")
            .decode("ascii")
        )
        slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
        if not slug:
            slug = uuid4().hex
        return slug

    def parse_json_list(value):
        if value is None:
            return []
        if isinstance(value, (list, tuple, set)):
            return [item for item in value]
        if isinstance(value, (bytes, bytearray)):
            try:
                value = value.decode("utf-8")
            except UnicodeDecodeError:
                value = ""
        if isinstance(value, str):
            candidate = value.strip()
            if not candidate:
                return []
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, ValueError):
                pass
            if "," in candidate:
                return [
                    item.strip()
                    for item in candidate.split(",")
                    if item and item.strip()
                ]
            return [candidate]
        return []

    def looks_like_empty_json_structure(value: str) -> bool:
        if not isinstance(value, str):
            return False
        stripped = value.strip()
        if not stripped:
            return True
        simplified = re.sub(r"[\[\]\{\}\s]", "", stripped)
        return simplified == ""

    def normalize_variations_input(raw_value):
        if raw_value is None:
            return [], None

        candidates = []
        if isinstance(raw_value, (list, tuple, set)):
            candidates = list(raw_value)
        elif isinstance(raw_value, (bytes, bytearray)):
            try:
                decoded = raw_value.decode("utf-8")
            except UnicodeDecodeError:
                decoded = ""
            candidates = parse_json_list(decoded)
            if not candidates and decoded.strip():
                candidates = [decoded.strip()]
        elif isinstance(raw_value, str):
            trimmed = raw_value.strip()
            if not trimmed:
                candidates = []
            else:
                parsed_candidates = parse_json_list(trimmed)
                if parsed_candidates:
                    candidates = parsed_candidates
                elif looks_like_empty_json_structure(trimmed):
                    candidates = []
                else:
                    candidates = [trimmed]
        else:
            candidates = [raw_value]

        normalized: List[Dict[str, str]] = []
        seen_names = set()

        for entry in candidates:
            if isinstance(entry, dict):
                raw_name = entry.get("name")
                existing_id = entry.get("id") or entry.get("_id") or entry.get("variation_id")
            else:
                raw_name = entry
                existing_id = None

            name = str(raw_name or "").strip()
            if not name:
                continue
            lowered = name.lower()
            if lowered in seen_names:
                continue
            seen_names.add(lowered)

            variation_id = ""
            if existing_id:
                variation_id = str(existing_id).strip()
            if not variation_id:
                variation_id = uuid4().hex

            normalized.append({"id": variation_id, "name": name})

            if len(normalized) > MAX_PRODUCT_VARIATIONS:
                return [], f"You can specify up to {MAX_PRODUCT_VARIATIONS} variations per product."

        return normalized, None

    def normalize_object_id_value(value):
        if isinstance(value, ObjectId):
            return value
        try:
            return ObjectId(str(value))
        except (InvalidId, TypeError):
            return None

    def normalize_object_id_list(values) -> List[ObjectId]:
        normalized_ids: List[ObjectId] = []
        if not values:
            return normalized_ids
        for value in values:
            if isinstance(value, ObjectId):
                normalized_ids.append(value)
                continue
            try:
                normalized_ids.append(ObjectId(str(value)))
            except (InvalidId, TypeError):
                continue
        return normalized_ids

    def fetch_categories_by_ids(category_ids) -> Dict[ObjectId, Dict]:
        if not category_ids:
            return {}
        normalized_ids: List[ObjectId] = []
        seen: Set[ObjectId] = set()
        for value in category_ids:
            current_id = value if isinstance(value, ObjectId) else None
            if not current_id:
                try:
                    current_id = ObjectId(str(value))
                except (InvalidId, TypeError):
                    continue
            if current_id in seen:
                continue
            seen.add(current_id)
            normalized_ids.append(current_id)
        if not normalized_ids:
            return {}
        category_documents = db.categories.find({"_id": {"$in": normalized_ids}})
        return {document["_id"]: document for document in category_documents}

    def normalize_showcase_label_value(value) -> str:
        if not isinstance(value, str):
            return ""
        trimmed = value.strip()
        if not trimmed:
            return ""
        return trimmed[:SHOWCASE_LABEL_MAX_LENGTH]

    def normalize_showcase_label_overrides(overrides, allowed_ids=None):
        if not isinstance(overrides, dict):
            return {}

        normalized: Dict[str, Dict[str, str]] = {}
        allowed_set = set(allowed_ids or [])

        for raw_id, payload in overrides.items():
            product_id = str(raw_id or "").strip()
            if not product_id:
                continue
            if allowed_set and product_id not in allowed_set:
                continue
            if not isinstance(payload, dict):
                continue

            badge_label = normalize_showcase_label_value(
                payload.get("badge_label") or payload.get("badgeLabel")
            )
            provenance_label = normalize_showcase_label_value(
                payload.get("provenance_label") or payload.get("provenanceLabel")
            )

            if not badge_label and not provenance_label:
                continue

            normalized[product_id] = {}
            if badge_label:
                normalized[product_id]["badge_label"] = badge_label
            if provenance_label:
                normalized[product_id]["provenance_label"] = provenance_label

        return normalized

    def serialize_category(category_document, product_counts=None):
        if not category_document:
            return {}

        created_at = category_document.get("created_at")
        product_count = 0
        if product_counts is not None:
            product_count = int(
                product_counts.get(category_document.get("_id"), 0) or 0
            )

        return {
            "id": str(category_document.get("_id")),
            "name": category_document.get("name", ""),
            "slug": category_document.get("slug", ""),
            "created_by": category_document.get("created_by", "") or "",
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else None,
            "product_count": product_count,
        }

    def get_or_create_category(category_name: str, creator_email: str):
        normalized_name = normalize_category_name(category_name)
        if len(normalized_name) < 2:
            return None, False, "Category names must be at least two characters long."
        slug = slugify_category_name(normalized_name)
        existing = db.categories.find_one({"slug": slug})
        if existing:
            if normalized_name and normalized_name != existing.get("name"):
                db.categories.update_one(
                    {"_id": existing["_id"]}, {"$set": {"name": normalized_name}}
                )
                existing["name"] = normalized_name
            return existing, False, None

        document = {
            "name": normalized_name,
            "slug": slug,
            "created_at": datetime.utcnow(),
            "created_by": normalize_email(creator_email),
        }
        try:
            insert_result = db.categories.insert_one(document)
        except Exception:
            existing = db.categories.find_one({"slug": slug})
            if existing:
                return existing, False, None
            raise
        created = db.categories.find_one({"_id": insert_result.inserted_id})
        return created, True, None

    def resolve_category_ids_from_payload(payload: Dict, creator_email: str):
        payload = payload or {}
        raw_existing = payload.get("category_ids")
        fallback_existing = payload.get("categories")
        raw_new = payload.get("new_categories")

        existing_candidates = parse_json_list(raw_existing)
        if not existing_candidates and fallback_existing:
            existing_candidates = parse_json_list(fallback_existing)
        new_candidates = [
            normalize_category_name(value)
            for value in parse_json_list(raw_new)
            if isinstance(value, (str, bytes, bytearray))
        ]

        normalized_existing_ids = normalize_object_id_list(existing_candidates)
        resolved_ids: List[ObjectId] = []
        seen: Set[ObjectId] = set()

        if normalized_existing_ids:
            cursor = db.categories.find({"_id": {"$in": normalized_existing_ids}})
            for document in cursor:
                category_id = document["_id"]
                if category_id in seen:
                    continue
                seen.add(category_id)
                resolved_ids.append(category_id)

        for candidate in new_candidates:
            if not candidate:
                continue
            category_document, _, category_error = get_or_create_category(
                candidate, creator_email
            )
            if category_error:
                return None, category_error
            if category_document and category_document["_id"] not in seen:
                resolved_ids.append(category_document["_id"])
                seen.add(category_document["_id"])

        return resolved_ids, None

    def build_category_product_counts():
        counts: Dict[ObjectId, int] = {}
        try:
            pipeline = [
                {"$match": {"category_ids": {"$exists": True, "$ne": []}}},
                {"$unwind": "$category_ids"},
                {"$group": {"_id": "$category_ids", "count": {"$sum": 1}}},
            ]
            for entry in db.products.aggregate(pipeline):
                category_id = entry.get("_id")
                if not category_id:
                    continue
                try:
                    counts[category_id] = int(entry.get("count", 0) or 0)
                except (TypeError, ValueError):
                    counts[category_id] = 0
        except Exception:
            return counts
        return counts

    def serialize_product(product_document, user_names=None, category_map=None):
        created_at = product_document.get("created_at")
        try:
            price_value = float(product_document.get("price", 0) or 0)
        except (TypeError, ValueError):
            price_value = 0.0

        discount_raw = product_document.get("discount_price")
        try:
            discount_value = float(discount_raw)
            if not math.isfinite(discount_value):
                discount_value = None
        except (TypeError, ValueError):
            discount_value = None
        if discount_value is not None and discount_value <= 0:
            discount_value = None
        if discount_value is not None and discount_value >= price_value:
            discount_value = None

        raw_filenames = product_document.get("image_filenames")
        image_filenames: List[str] = []
        if isinstance(raw_filenames, list):
            image_filenames = [str(filename) for filename in raw_filenames if filename]

        image_filename = product_document.get("image_filename")
        if image_filename:
            normalized_filename = str(image_filename)
            if normalized_filename not in image_filenames:
                image_filenames.insert(0, normalized_filename)

        image_urls: List[str] = []
        seen_urls = set()

        def append_url(url: Optional[str]) -> None:
            if not url:
                return
            if url in seen_urls:
                return
            image_urls.append(url)
            seen_urls.add(url)

        for filename in image_filenames:
            relative_path = f"uploads/{filename}"
            append_url(urljoin(request.host_url, relative_path))

        legacy_urls = product_document.get("image_urls")
        if isinstance(legacy_urls, list):
            for url in legacy_urls:
                append_url(str(url))

        legacy_url = product_document.get("image_url")
        if legacy_url:
            append_url(str(legacy_url))

        primary_image_url = image_urls[0] if image_urls else ""

        raw_category_ids = product_document.get("category_ids")
        category_ids: List[ObjectId] = []
        if isinstance(raw_category_ids, list):
            for raw_id in raw_category_ids:
                if isinstance(raw_id, ObjectId):
                    category_ids.append(raw_id)
                else:
                    try:
                        category_ids.append(ObjectId(str(raw_id)))
                    except (InvalidId, TypeError):
                        continue

        resolved_category_map = category_map or fetch_categories_by_ids(category_ids)
        serialized_categories = []
        for category_id in category_ids:
            category_document = resolved_category_map.get(category_id)
            if not category_document:
                continue
            serialized_categories.append(
                {
                    "id": str(category_document.get("_id")),
                    "name": category_document.get("name", ""),
                    "slug": category_document.get("slug", ""),
                }
            )

        raw_variations = product_document.get("variations")
        variations_list: List[Dict[str, str]] = []
        if isinstance(raw_variations, list):
            variations_list, _ = normalize_variations_input(raw_variations)

        owner_email = normalize_email(product_document.get("created_by"))
        owner_name = ""
        if user_names and owner_email in user_names:
            owner_name = user_names.get(owner_email, "") or ""
        elif owner_email:
            user_document = db.users.find_one({"email": owner_email})
            if user_document:
                owner_name = user_document.get("name", "") or ""
        if not owner_name and owner_email == DEFAULT_ADMIN_EMAIL:
            owner_name = DEFAULT_ADMIN_NAME

        return {
            "id": str(product_document.get("_id")),
            "name": product_document.get("name", ""),
            "price": f"{price_value:.2f}",
            "discount_price": f"{discount_value:.2f}" if discount_value is not None else None,
            "description": product_document.get("description", ""),
            "image_url": primary_image_url,
            "image_urls": image_urls,
            "image_filenames": image_filenames,
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else None,
            "created_by": owner_email,
            "created_by_name": owner_name,
            "category_ids": [str(category_id) for category_id in category_ids],
            "categories": serialized_categories,
            "variations": variations_list,
        }

    def build_product_serialization_context(
        product_documents,
    ) -> Tuple[Dict[str, str], Dict[ObjectId, Dict]]:
        if not product_documents:
            return {}, {}

        author_emails = {
            normalize_email(document.get("created_by"))
            for document in product_documents
            if document.get("created_by")
        }
        author_emails = {email for email in author_emails if email}

        user_names: Dict[str, str] = {}
        if author_emails:
            cursor = db.users.find({"email": {"$in": list(author_emails)}})
            for user_document in cursor:
                normalized_email = normalize_email(user_document.get("email"))
                if normalized_email:
                    user_names[normalized_email] = user_document.get("name", "") or ""
        if DEFAULT_ADMIN_EMAIL in author_emails:
            user_names.setdefault(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME)

        category_ids: Set[ObjectId] = set()
        for document in product_documents:
            raw_category_ids = document.get("category_ids")
            if not isinstance(raw_category_ids, list):
                continue
            for raw_id in raw_category_ids:
                normalized_id = normalize_object_id_value(raw_id)
                if normalized_id:
                    category_ids.add(normalized_id)

        category_map = fetch_categories_by_ids(category_ids)
        return user_names, category_map

    def resolve_featured_product_documents(limit=FEATURED_SHOWCASE_LIMIT):
        ensure_seed_products()
        selection_document = featured_selection_collection.find_one(
            {"_id": FEATURED_SELECTION_ID}
        )
        curated_ids: List[str] = []
        curated_docs: List[Dict] = []
        normalized_object_ids: List[ObjectId] = []
        curated_label_overrides: Dict[str, Dict[str, str]] = {}

        if selection_document:
            raw_ids = selection_document.get("product_ids") or []
            for raw in raw_ids:
                normalized_object_id = normalize_object_id_value(raw)
                if not normalized_object_id:
                    continue
                stringified_id = str(normalized_object_id)
                if stringified_id in curated_ids:
                    continue
                curated_ids.append(stringified_id)
                normalized_object_ids.append(normalized_object_id)
                if len(curated_ids) >= limit:
                    break
            if normalized_object_ids:
                fetched_docs = list(
                    db.products.find({"_id": {"$in": normalized_object_ids}})
                )
                doc_map = {str(document["_id"]): document for document in fetched_docs}
                curated_docs = [
                    doc_map[string_id]
                    for string_id in curated_ids
                    if string_id in doc_map
                ]
            curated_label_overrides = normalize_showcase_label_overrides(
                selection_document.get("label_overrides"), curated_ids
            )

        source = "curated" if curated_docs else "recent"
        used_ids = {document["_id"] for document in curated_docs}
        remaining_slots = max(0, limit - len(curated_docs))
        if remaining_slots > 0:
            fallback_filter = {"_id": {"$nin": list(used_ids)}} if used_ids else {}
            fallback_cursor = (
                db.products.find(fallback_filter)
                .sort("created_at", -1)
                .limit(remaining_slots)
            )
            fallback_docs = list(fallback_cursor)
            curated_docs.extend(fallback_docs)
            if fallback_docs and curated_ids:
                source = "mixed"
            elif fallback_docs and not curated_ids:
                source = "recent"

        return curated_docs[:limit], curated_ids, source, curated_label_overrides

    def safe_float(value, default=0.0):
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return default
        if math.isfinite(numeric):
            return numeric
        return default

    def safe_positive_int(value, default=0):
        try:
            numeric = int(float(value))
        except (TypeError, ValueError):
            return default
        return max(default, numeric)

    def normalize_order_item(payload):
        if not isinstance(payload, dict):
            return None

        product_identifier = (
            payload.get("product_id")
            or payload.get("productId")
            or payload.get("id")
            or payload.get("product")
        )
        if isinstance(product_identifier, ObjectId):
            product_identifier = str(product_identifier)
        elif product_identifier is not None:
            product_identifier = str(product_identifier)
        product_id = (product_identifier or "").strip()
        if not product_id:
            return None

        quantity = safe_positive_int(payload.get("quantity"), 1) or 1
        name = str(payload.get("name") or "").strip()
        price_value = safe_float(payload.get("price"), 0.0)
        image_url = str(
            payload.get("imageUrl") or payload.get("image_url") or ""
        ).strip()
        variation_identifier = (
            payload.get("variation_id")
            or payload.get("variationId")
            or payload.get("selectedVariationId")
            or ""
        )
        if isinstance(variation_identifier, ObjectId):
            variation_identifier = str(variation_identifier)
        variation_id = (
            str(variation_identifier).strip() if variation_identifier else ""
        )
        variation_name_source = (
            payload.get("variation_name")
            or payload.get("variationName")
            or ""
        )
        variation_name = (
            str(variation_name_source).strip() if variation_name_source else ""
        )

        return {
            "product_id": product_id,
            "quantity": quantity,
            "name": name,
            "price": round(price_value, 2),
            "image_url": image_url,
            "variation_id": variation_id,
            "variation_name": variation_name,
        }

    def calculate_order_totals(items: List[Dict]) -> Dict[str, float]:
        subtotal = 0.0
        total_items = 0
        for item in items:
            if not isinstance(item, dict):
                continue
            quantity = safe_positive_int(item.get("quantity"), 0)
            price_value = safe_float(item.get("price"), 0.0)
            subtotal += price_value * quantity
            total_items += quantity
        return {
            "subtotal": round(subtotal, 2),
            "total_items": total_items,
        }

    def serialize_order(order_document):
        if not order_document:
            return None

        order_id = order_document.get("_id")
        created_at = order_document.get("created_at")
        if not isinstance(created_at, datetime) and isinstance(order_id, ObjectId):
            try:
                created_at = order_id.generation_time
            except Exception:
                created_at = None

        if isinstance(created_at, datetime):
            created_at_iso = (
                created_at.isoformat()
                if created_at.tzinfo is not None
                else f"{created_at.isoformat()}Z"
            )
        else:
            created_at_iso = None

        product_summary_cache: Dict[str, Optional[Dict[str, str]]] = {}
        customer_document = order_document.get("customer") or {}
        fallback_email = normalize_email(order_document.get("user"))
        customer_type = str(customer_document.get("type") or "").strip().lower()
        serialized_customer = {
            "name": str(customer_document.get("name") or "").strip(),
            "email": normalize_email(
                customer_document.get("email") or fallback_email
            ),
            "phone": str(customer_document.get("phone") or "").strip(),
            "type": customer_type or ("account" if fallback_email else "guest"),
        }
        shipping_address = serialize_address_payload(
            order_document.get("shipping_address")
        )

        def fetch_product_summary(product_id: str):
            if not product_id:
                return None
            cached = product_summary_cache.get(product_id)
            if cached is not None:
                return cached
            try:
                object_id = ObjectId(product_id)
            except (InvalidId, TypeError):
                product_summary_cache[product_id] = None
                return None

            product_document = db.products.find_one({"_id": object_id})
            if not product_document:
                product_summary_cache[product_id] = None
                return None

            summary = {
                "name": product_document.get("name", ""),
                "price": safe_float(product_document.get("price"), 0.0),
                "image_url": "",
                "variations": product_document.get("variations") or [],
            }

            image_urls = product_document.get("image_urls")
            if isinstance(image_urls, list) and image_urls:
                summary["image_url"] = str(image_urls[0])
            else:
                filenames = product_document.get("image_filenames")
                primary_filename = ""
                if isinstance(filenames, list) and filenames:
                    primary_filename = filenames[0]
                elif product_document.get("image_filename"):
                    primary_filename = product_document.get("image_filename")
                if primary_filename:
                    summary["image_url"] = urljoin(
                        request.host_url, f"uploads/{primary_filename}"
                    )
                elif product_document.get("image_url"):
                    summary["image_url"] = str(product_document.get("image_url"))

            product_summary_cache[product_id] = summary
            return summary

        raw_items = order_document.get("items") or []
        serialized_items = []
        for index, entry in enumerate(raw_items):
            if isinstance(entry, str):
                cleaned = entry.strip()
                serialized_items.append(
                    {
                        "productId": "",
                        "name": cleaned or "Curated Selection",
                        "quantity": 1,
                        "price": 0,
                        "imageUrl": "",
                        "lineTotal": 0,
                        "variationId": "",
                        "variationName": "",
                    }
                )
                continue

            if not isinstance(entry, dict):
                continue

            product_identifier = (
                entry.get("product_id")
                or entry.get("productId")
                or entry.get("id")
                or entry.get("product")
                or ""
            )
            if isinstance(product_identifier, ObjectId):
                product_identifier = str(product_identifier)
            product_id = str(product_identifier).strip()

            quantity = safe_positive_int(entry.get("quantity"), 1) or 1
            price_value = entry.get("price")
            name = (entry.get("name") or "").strip()
            image_url = str(
                entry.get("image_url") or entry.get("imageUrl") or ""
            ).strip()
            variation_identifier = (
                entry.get("variation_id")
                or entry.get("variationId")
                or entry.get("selectedVariationId")
                or ""
            )
            if isinstance(variation_identifier, ObjectId):
                variation_identifier = str(variation_identifier)
            variation_id = (
                str(variation_identifier).strip()
                if variation_identifier
                else ""
            )
            variation_name_source = (
                entry.get("variation_name")
                or entry.get("variationName")
                or ""
            )
            variation_name = (
                str(variation_name_source).strip()
                if variation_name_source
                else ""
            )

            product_summary = fetch_product_summary(product_id) if product_id else None

            if not name and product_summary and product_summary.get("name"):
                name = product_summary["name"]
            if price_value is None and product_summary is not None:
                price_value = product_summary.get("price")
            price_value = safe_float(price_value, 0.0)

            if not image_url and product_summary:
                image_url = product_summary.get("image_url") or ""

            if (
                not variation_name
                and variation_id
                and product_summary
                and isinstance(product_summary.get("variations"), list)
            ):
                for variation_entry in product_summary["variations"]:
                    possible_id = (
                        variation_entry.get("id")
                        or variation_entry.get("_id")
                        or variation_entry.get("tempId")
                        or ""
                    )
                    possible_id = (
                        str(possible_id).strip() if possible_id else ""
                    )
                    if possible_id and possible_id == variation_id:
                        possible_name = str(
                            variation_entry.get("name") or ""
                        ).strip()
                        if possible_name:
                            variation_name = possible_name
                        break

            line_total = round(price_value * quantity, 2)
            serialized_items.append(
                {
                    "productId": product_id or f"legacy-{index}",
                    "name": name or "Curated Selection",
                    "quantity": quantity,
                    "price": round(price_value, 2),
                    "imageUrl": image_url,
                    "lineTotal": line_total,
                    "variationId": variation_id,
                    "variationName": variation_name,
                }
            )

        if not serialized_items:
            return None

        subtotal = order_document.get("subtotal")
        total_items = order_document.get("total_items")

        if subtotal is None:
            subtotal = sum(item["lineTotal"] for item in serialized_items)
        if total_items is None:
            total_items = sum(item["quantity"] for item in serialized_items)

        order_number = str(order_document.get("order_number", "")).strip()
        if not order_number and isinstance(order_id, ObjectId):
            order_number = str(order_id)[-8:].upper()

        return {
            "id": str(order_id) if order_id else "",
            "orderNumber": order_number,
            "createdAt": created_at_iso,
            "items": serialized_items,
            "subtotal": round(safe_float(subtotal, 0.0), 2),
            "totalItems": safe_positive_int(total_items, 0),
            "customer": serialized_customer,
            "shippingAddress": shipping_address,
        }
    def fetch_product(product_id: str):
        try:
            object_id = ObjectId(product_id)
        except (InvalidId, TypeError):
            return None, (jsonify({"message": "Invalid product identifier."}), 400)

        product_document = db.products.find_one({"_id": object_id})
        if not product_document:
            return None, (jsonify({"message": "Product not found."}), 404)

        return product_document, None

    def can_manage_product(product_document, user_document) -> bool:
        if not product_document or not user_document:
            return False

        user_role = get_user_role(user_document)
        if user_role == "admin":
            return True

        if user_role != "seller":
            return False

        owner_email = normalize_email(product_document.get("created_by"))
        current_email = normalize_email(user_document.get("email"))
        return owner_email and owner_email == current_email

    # --- ROUTES ---

    @app.route("/uploads/<path:filename>")
    def serve_uploaded_file(filename: str):
        return send_from_directory(app.config["PRODUCT_UPLOAD_FOLDER"], filename)

    @app.route("/send-otp", methods=["POST"])
    @app.route("/api/send-otp", methods=["POST"])
    def issue_email_verification_code():
        payload = request.get_json(silent=True) or {}
        email = normalize_email(payload.get("email"))

        if not is_valid_email(email):
            return jsonify({"message": "Please provide a valid email address."}), 400

        result = dispatch_verification_code(email)
        if not result.get("success"):
            return (
                jsonify(
                    {
                        "message": "We could not send the verification email. Please try again in a moment.",
                        "error": result.get("error"),
                    }
                ),
                502,
            )

        expires_at = result.get("expires_at")
        return (
            jsonify(
                {
                    "message": "Verification code sent.",
                    "email": email,
                    "expires_in_seconds": otp_expiration_minutes * 60,
                    "otp_length": result.get("otp_length", otp_code_length),
                    **(
                        {"expires_at": f"{expires_at.isoformat()}Z"}
                        if expires_at
                        else {}
                    ),
                }
            ),
            200,
        )

    @app.route("/verify-otp", methods=["POST"])
    @app.route("/api/verify-otp", methods=["POST"])
    def verify_email_otp():
        payload = request.get_json(silent=True) or {}
        email = normalize_email(payload.get("email"))
        otp = str(payload.get("otp", "")).strip()

        if not is_valid_email(email):
            return jsonify({"message": "Please provide a valid email address."}), 400

        if not (otp.isdigit() and len(otp) == otp_code_length):
            return (
                jsonify(
                    {
                        "message": f"The verification code must be {otp_code_length} digits."
                    }
                ),
                400,
            )

        code_record = email_verification_collection.find_one({"email": email})
        if not code_record:
            return (
                jsonify(
                    {
                        "message": "No verification request found for this email. Please request a new code."
                    }
                ),
                400,
            )

        expires_at = code_record.get("expires_at")
        if not expires_at or expires_at < datetime.utcnow():
            email_verification_collection.delete_one({"_id": code_record["_id"]})
            return (
                jsonify(
                    {
                        "message": "The verification code has expired. Please request a new one."
                    }
                ),
                400,
            )

        stored_hash = code_record.get("otp_hash")
        if not stored_hash or not bcrypt.checkpw(otp.encode("utf-8"), stored_hash):
            failed_attempts = int(code_record.get("failed_attempts", 0) or 0) + 1
            if failed_attempts >= max_failed_otp_attempts:
                email_verification_collection.delete_one({"_id": code_record["_id"]})
                return (
                    jsonify(
                        {
                            "message": "Too many incorrect attempts. Please request a new verification code."
                        }
                    ),
                    400,
                )

            email_verification_collection.update_one(
                {"_id": code_record["_id"]},
                {"$set": {"failed_attempts": failed_attempts}},
            )
            return jsonify({"message": "The verification code is incorrect."}), 400

        email_verification_collection.delete_one({"_id": code_record["_id"]})

        verified_at = datetime.utcnow()
        update_result = db.users.update_one(
            {"email": email},
            {"$set": {"email_verified": True, "verified_at": verified_at}},
        )
        if update_result.matched_count == 0:
            app.logger.warning(
                "OTP verified for %s but no matching user record was updated.", email
            )

        return (
            jsonify(
                {
                    "message": "Email verified successfully.",
                    "verified": True,
                    "verified_at": f"{verified_at.isoformat()}Z",
                }
            ),
            200,
        )

    # Register
    @app.route("/api/register", methods=["POST"])
    def register():
        payload = request.get_json(silent=True) or {}
        email = normalize_email(payload.get("email"))
        name = str(payload.get("name", "")).strip()
        password = str(payload.get("password", ""))
        phone = str(payload.get("phone", "")).strip()
        address_payload = payload.get("address")
        normalized_address = normalize_address_payload(address_payload)

        if not email or not name or not password:
            return (
                jsonify(
                    {
                        "message": "Email, name, and password are required to create an account."
                    }
                ),
                400,
            )

        if db.users.find_one({"email": email}):
            return jsonify({"message": "An account with this email already exists."}), 400

        hashed_pw = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
        assigned_role = "admin" if email == DEFAULT_ADMIN_EMAIL else "standard"

        user_document = {
            "email": email,
            "name": name,
            "password": hashed_pw,
            "created_at": datetime.utcnow(),
            "role": assigned_role,
            "email_verified": False,
        }

        if phone:
            user_document["phone"] = phone
        if normalized_address:
            user_document["address"] = normalized_address

        insert_result = db.users.insert_one(user_document)

        otp_result = dispatch_verification_code(email)
        if not otp_result.get("success"):
            db.users.delete_one({"_id": insert_result.inserted_id})
            return (
                jsonify(
                    {
                        "message": "Account creation failed while sending the verification code. Please try again.",
                        "error": otp_result.get("error"),
                    }
                ),
                502,
            )

        return (
            jsonify(
                {
                    "message": "Account created. Enter the verification code we emailed to continue.",
                    "email": email,
                    "requires_verification": True,
                    "otp_length": otp_result.get("otp_length", otp_code_length),
                    "expires_in_seconds": otp_expiration_minutes * 60,
                    **(
                        {"expires_at": f"{otp_result['expires_at'].isoformat()}Z"}
                        if otp_result.get("expires_at")
                        else {}
                    ),
                }
            ),
            201,
        )

    # Login
    @app.route("/api/login", methods=["POST"])
    def login():
        payload = request.get_json(silent=True) or {}
        email = normalize_email(payload.get("email"))
        password = str(payload.get("password", ""))

        if not email or not password:
            return jsonify({"message": "Email and password are required."}), 400

        user = db.users.find_one({"email": email})
        if not user or not bcrypt.checkpw(password.encode("utf-8"), user["password"]):
            return jsonify({"message": "Invalid credentials"}), 401

        stored_email = normalize_email(user.get("email"))
        if stored_email == DEFAULT_ADMIN_EMAIL and str(
            user.get("role", "")
        ).strip().lower() != "admin":
            db.users.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "role": "admin",
                        "name": user.get("name") or DEFAULT_ADMIN_NAME,
                    }
                },
            )
        if user.get("email_verified") is False:
            return (
                jsonify(
                    {
                        "message": "Please verify your email before logging in.",
                        "requires_verification": True,
                    }
                ),
                403,
            )

        db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login_at": datetime.utcnow()}},
        )
        user = db.users.find_one({"_id": user["_id"]})

        token = create_access_token(identity=email)
        user_profile = serialize_user_profile(user)
        return jsonify({"access_token": token, "user": user_profile})

    @app.route("/api/account", methods=["GET", "PUT"])
    @jwt_required()
    def manage_account():
        current_email = get_jwt_identity()
        user = db.users.find_one({"email": current_email})

        if not user:
            return jsonify({"message": "Account not found."}), 404

        if request.method == "GET":
            return jsonify(
                {
                    "user": serialize_user_profile(user),
                }
            )

        payload = request.get_json(silent=True) or {}

        desired_email = normalize_email(payload.get("email", current_email))
        desired_name = str(payload.get("name", user.get("name", ""))).strip()
        desired_phone = str(payload.get("phone", user.get("phone", ""))).strip()
        new_password = str(payload.get("password", "")).strip()
        address_provided = "address" in payload
        normalized_address = (
            normalize_address_payload(payload.get("address"))
            if address_provided
            else {}
        )

        if not desired_email:
            return jsonify({"message": "Email is required."}), 400

        if desired_email != current_email and db.users.find_one({"email": desired_email}):
            return jsonify({"message": "Another account already uses this email."}), 400

        updates: Dict[str, str] = {}
        unset_ops: Dict[str, str] = {}

        if desired_email != user.get("email"):
            updates["email"] = desired_email

        if desired_name and desired_name != user.get("name"):
            updates["name"] = desired_name

        if desired_phone:
            if desired_phone != user.get("phone", ""):
                updates["phone"] = desired_phone
        else:
            if user.get("phone"):
                unset_ops["phone"] = ""

        if new_password:
            hashed_pw = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt())
            updates["password"] = hashed_pw

        if address_provided:
            if normalized_address:
                updates["address"] = normalized_address
            elif user.get("address"):
                unset_ops["address"] = ""

        if not updates and not unset_ops:
            return jsonify({"message": "No account changes detected."}), 400

        update_query = {}
        if updates:
            update_query["$set"] = updates
        if unset_ops:
            update_query["$unset"] = unset_ops

        db.users.update_one({"email": current_email}, update_query)

        updated_email = updates.get("email", current_email)
        updated_user = db.users.find_one({"email": updated_email})

        token = create_access_token(identity=normalize_email(updated_user.get("email")))
        user_profile = serialize_user_profile(updated_user)
        return jsonify(
            {
                "message": "Account updated successfully.",
                "access_token": token,
                "user": user_profile,
            }
        )

    @app.route("/api/account/avatar", methods=["POST", "DELETE"])
    @jwt_required()
    def manage_account_avatar():
        current_email = get_jwt_identity()
        user = db.users.find_one({"email": current_email})

        if not user:
            return jsonify({"message": "Account not found."}), 404

        if request.method == "DELETE":
            previous_filename = user.get("avatar_filename")
            unset_operations: Dict[str, str] = {}
            if previous_filename:
                remove_product_image(previous_filename)
                unset_operations["avatar_filename"] = ""
            if user.get("avatar_updated_at"):
                unset_operations["avatar_updated_at"] = ""

            if unset_operations:
                db.users.update_one(
                    {"_id": user["_id"]},
                    {
                        "$unset": unset_operations,
                    },
                )

            updated_user = db.users.find_one({"_id": user["_id"]})
            token = create_access_token(
                identity=normalize_email(updated_user.get("email"))
            )
            user_profile = serialize_user_profile(updated_user)

            message = (
                "Profile picture removed successfully."
                if previous_filename
                else "No profile picture on record. Nothing to remove."
            )

            return jsonify(
                {
                    "message": message,
                    "access_token": token,
                    "user": user_profile,
                }
            )

        image_file = request.files.get("avatar")
        if not image_file or not getattr(image_file, "filename", ""):
            return jsonify({"message": "Please choose an image to upload."}), 400

        new_filename, image_error = save_product_image(image_file)
        if image_error:
            return jsonify({"message": image_error}), 400

        previous_filename = user.get("avatar_filename")

        db.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "avatar_filename": new_filename,
                    "avatar_updated_at": datetime.utcnow(),
                }
            },
        )

        if previous_filename and previous_filename != new_filename:
            remove_product_image(previous_filename)

        updated_user = db.users.find_one({"_id": user["_id"]})
        token = create_access_token(
            identity=normalize_email(updated_user.get("email"))
        )
        user_profile = serialize_user_profile(updated_user)

        return jsonify(
            {
                "message": "Profile picture updated successfully.",
                "access_token": token,
                "user": user_profile,
            }
        )

    # Products
    @app.route("/api/products", methods=["GET"])
    def list_products():
        ensure_seed_products()
        product_docs = list(db.products.find().sort("created_at", -1))

        user_names, category_map = build_product_serialization_context(product_docs)

        products = [
            serialize_product(
                document, user_names=user_names, category_map=category_map
            )
            for document in product_docs
        ]
        return jsonify({"products": products})

    @app.route("/api/featured-products", methods=["GET"])
    def get_featured_products():
        (
            product_docs,
            requested_ids,
            source,
            label_overrides,
        ) = resolve_featured_product_documents()

        if not product_docs:
            return jsonify(
                {
                    "products": [],
                    "requested_ids": requested_ids,
                    "source": source,
                    "limit": FEATURED_SHOWCASE_LIMIT,
                    "label_overrides": label_overrides,
                }
            )

        user_names, category_map = build_product_serialization_context(product_docs)
        products = [
            serialize_product(
                document, user_names=user_names, category_map=category_map
            )
            for document in product_docs
        ]

        return jsonify(
            {
                "products": products,
                "requested_ids": requested_ids,
                "source": source,
                "limit": FEATURED_SHOWCASE_LIMIT,
                "label_overrides": label_overrides,
            }
        )

    @app.route("/api/featured-products", methods=["PUT"])
    @jwt_required()
    def update_featured_products():
        current_user, permission_error = require_admin_user()
        if permission_error:
            return permission_error

        payload = request.get_json(silent=True) or {}
        raw_ids = payload.get("product_ids")
        raw_label_overrides = payload.get("label_overrides") or {}

        if not isinstance(raw_ids, list):
            return (
                jsonify(
                    {
                        "message": "Provide the desired `product_ids` list to curate the home showcase."
                    }
                ),
                400,
            )

        normalized_ids: List[str] = []
        seen_ids: Set[str] = set()
        invalid_ids: List[str] = []

        for raw in raw_ids:
            normalized_object_id = normalize_object_id_value(raw)
            if not normalized_object_id:
                invalid_ids.append(str(raw))
                continue
            stringified_id = str(normalized_object_id)
            if stringified_id in seen_ids:
                continue
            seen_ids.add(stringified_id)
            normalized_ids.append(stringified_id)

        if invalid_ids:
            return (
                jsonify(
                    {
                        "message": "One or more product identifiers were invalid.",
                        "invalid_ids": invalid_ids,
                    }
                ),
                400,
            )

        if len(normalized_ids) != FEATURED_SHOWCASE_LIMIT:
            return (
                jsonify(
                    {
                        "message": f"Select exactly {FEATURED_SHOWCASE_LIMIT} products for the hero showcase.",
                        "limit": FEATURED_SHOWCASE_LIMIT,
                    }
                ),
                400,
            )

        label_overrides = normalize_showcase_label_overrides(
            raw_label_overrides, normalized_ids
        )

        object_ids = [ObjectId(string_id) for string_id in normalized_ids]
        fetched_docs = list(db.products.find({"_id": {"$in": object_ids}}))
        found_map = {str(document["_id"]): document for document in fetched_docs}
        missing_ids = [
            string_id for string_id in normalized_ids if string_id not in found_map
        ]

        if missing_ids:
            return (
                jsonify(
                    {
                        "message": "Some selected products could not be found.",
                        "missing_ids": missing_ids,
                    }
                ),
                404,
            )

        featured_selection_collection.update_one(
            {"_id": FEATURED_SELECTION_ID},
            {
                "$set": {
                    "product_ids": normalized_ids,
                    "label_overrides": label_overrides,
                    "updated_at": datetime.utcnow(),
                    "updated_by": current_user.get("_id") if current_user else None,
                    "updated_by_email": normalize_email(
                        current_user.get("email") if current_user else ""
                    ),
                }
            },
            upsert=True,
        )

        (
            product_docs,
            requested_ids,
            source,
            selection_label_overrides,
        ) = resolve_featured_product_documents()
        user_names, category_map = build_product_serialization_context(product_docs)
        products = [
            serialize_product(
                document, user_names=user_names, category_map=category_map
            )
            for document in product_docs
        ]

        return jsonify(
            {
                "message": "Home showcase updated successfully.",
                "products": products,
                "requested_ids": requested_ids,
                "source": source,
                "limit": FEATURED_SHOWCASE_LIMIT,
                "label_overrides": selection_label_overrides,
            }
        )

    @app.route("/api/products/<product_id>", methods=["GET"])
    def get_product(product_id: str):
        product_document, load_error = fetch_product(product_id)
        if load_error:
            return load_error

        owner_email = normalize_email(product_document.get("created_by"))
        user_names: Dict[str, str] = {}
        if owner_email:
            user_document = db.users.find_one({"email": owner_email})
            if user_document:
                user_names[owner_email] = user_document.get("name", "") or ""
        if owner_email == DEFAULT_ADMIN_EMAIL:
            user_names.setdefault(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME)

        category_map = fetch_categories_by_ids(product_document.get("category_ids"))

        return jsonify(
            {
                "product": serialize_product(
                    product_document, user_names=user_names, category_map=category_map
                )
            }
        )

    @app.route("/api/products", methods=["POST"])
    @jwt_required()
    def create_product():
        current_user, permission_error = require_role("seller", "admin")
        if permission_error:
            return permission_error

        payload = request.form.to_dict() if request.form else {}
        if not payload:
            payload = request.get_json(silent=True) or {}

        name = str(payload.get("name", "")).strip()
        description = str(payload.get("description", "")).strip()
        raw_price = payload.get("price", "")
        image_files = []
        if request.files:
            image_files = request.files.getlist("images")
            if not image_files:
                fallback_file = request.files.get("image")
                if fallback_file:
                    image_files = [fallback_file]

        if not name:
            return jsonify({"message": "A product name is required."}), 400

        try:
            price_value = round(float(raw_price), 2)
        except (TypeError, ValueError):
            return jsonify({"message": "Price must be a valid number."}), 400

        if price_value <= 0:
            return jsonify({"message": "Price must be greater than zero."}), 400

        raw_discount_price = payload.get("discount_price", "")
        discount_price_value: Optional[float] = None
        if isinstance(raw_discount_price, (int, float)) or (
            isinstance(raw_discount_price, str) and raw_discount_price.strip()
        ):
            try:
                discount_price_value = round(float(raw_discount_price), 2)
            except (TypeError, ValueError):
                return (
                    jsonify({"message": "Discount price must be a valid number."}),
                    400,
                )
            if discount_price_value <= 0:
                return (
                    jsonify({"message": "Discount price must be greater than zero."}),
                    400,
                )
            if discount_price_value >= price_value:
                return (
                    jsonify(
                        {
                            "message": "Discount price must be lower than the standard price."
                        }
                    ),
                    400,
                )

        saved_filenames, image_error = save_product_images(image_files)
        if image_error:
            return jsonify({"message": image_error}), 400

        if not saved_filenames:
            return jsonify({"message": "Please upload at least one image for this product."}), 400

        creator_email = normalize_email(current_user.get("email"))
        resolved_category_ids, category_error = resolve_category_ids_from_payload(
            payload, creator_email
        )
        if category_error:
            remove_product_image(saved_filenames)
            return jsonify({"message": category_error}), 400

        variations_payload = payload.get("variations")
        variations_data, variations_error = normalize_variations_input(variations_payload)
        if variations_error:
            remove_product_image(saved_filenames)
            return jsonify({"message": variations_error}), 400

        product_document = {
            "name": name,
            "description": description,
            "price": price_value,
            "created_at": datetime.utcnow(),
            "created_by": creator_email,
            "image_filenames": saved_filenames,
            "image_filename": saved_filenames[0],
        }
        if discount_price_value is not None:
            product_document["discount_price"] = discount_price_value
        if resolved_category_ids:
            product_document["category_ids"] = resolved_category_ids
        if variations_data:
            product_document["variations"] = variations_data

        result = db.products.insert_one(product_document)
        created_product = db.products.find_one({"_id": result.inserted_id})
        category_map = fetch_categories_by_ids(created_product.get("category_ids"))

        return (
            jsonify(
                {
                    "message": "Product added successfully.",
                    "product": serialize_product(
                        created_product, category_map=category_map
                    ),
                }
            ),
            201,
        )

    @app.route("/api/products/<product_id>", methods=["PUT"])
    @jwt_required()
    def update_product(product_id: str):
        current_user, permission_error = require_role("seller", "admin")
        if permission_error:
            return permission_error

        product_document, load_error = fetch_product(product_id)
        if load_error:
            return load_error

        if not can_manage_product(product_document, current_user):
            return (
                jsonify({"message": "You do not have permission to modify this product."}),
                403,
            )

        existing_price_value = safe_float(product_document.get("price"), 0.0)

        payload = request.form.to_dict() if request.form else {}
        if not payload and request.is_json:
            payload = request.get_json(silent=True) or {}

        incoming_files = []
        if request.files:
            incoming_files = request.files.getlist("images")
            if not incoming_files:
                fallback_file = request.files.get("image")
                if fallback_file:
                    incoming_files = [fallback_file]

        updates: Dict[str, object] = {}

        existing_filenames: List[str] = []
        raw_existing = product_document.get("image_filenames")
        if isinstance(raw_existing, list):
            existing_filenames = [
                str(filename) for filename in raw_existing if filename
            ]
        legacy_filename = product_document.get("image_filename")
        if legacy_filename:
            normalized_legacy = str(legacy_filename)
            if normalized_legacy not in existing_filenames:
                existing_filenames.insert(0, normalized_legacy)

        def normalize_retained_value(value: str) -> str:
            candidate = str(value or "").strip()
            if not candidate:
                return ""
            parsed = urlparse(candidate)
            path_candidate = parsed.path if parsed.scheme else candidate
            basename = os.path.basename(path_candidate.replace("\\", "/"))
            if basename:
                return basename
            return candidate

        retain_explicit = False
        retain_field_value = None
        if "retain_images" in payload:
            retain_explicit = True
            retain_field_value = payload.get("retain_images")
        elif "retain_image_filenames" in payload:
            retain_explicit = True
            retain_field_value = payload.get("retain_image_filenames")

        retained_filenames: List[str] = []
        if retain_explicit:
            try:
                parsed_value = json.loads(retain_field_value) if retain_field_value else []
            except (json.JSONDecodeError, TypeError):
                return jsonify({"message": "We could not understand the retained image list."}), 400

            if not isinstance(parsed_value, list):
                return jsonify({"message": "We could not understand the retained image list."}), 400

            for item in parsed_value:
                normalized_candidate = normalize_retained_value(item)
                if not normalized_candidate:
                    continue

                if (
                    normalized_candidate in existing_filenames
                    and normalized_candidate not in retained_filenames
                ):
                    retained_filenames.append(normalized_candidate)
                    continue

                # As a fallback, try to match by suffix to guard against accidental path prefixes.
                for existing in existing_filenames:
                    if existing and existing.endswith(normalized_candidate) and existing not in retained_filenames:
                        retained_filenames.append(existing)
                        break
        else:
            retained_filenames = list(existing_filenames)

        removed_filenames: List[str] = []

        if "name" in payload:
            name_value = str(payload.get("name", "")).strip()
            if len(name_value) < 3:
                return jsonify({"message": "Product name must be at least 3 characters."}), 400
            updates["name"] = name_value

        if "description" in payload:
            updates["description"] = str(payload.get("description", "")).strip()

        if "price" in payload:
            try:
                price_value = round(float(payload["price"]), 2)
            except (TypeError, ValueError):
                return jsonify({"message": "Price must be a valid number."}), 400

            if price_value <= 0:
                return jsonify({"message": "Price must be greater than zero."}), 400
            updates["price"] = price_value
            existing_price_value = price_value

        if "discount_price" in payload:
            raw_discount = payload.get("discount_price")
            discount_value: Optional[float] = None
            has_value = False
            if isinstance(raw_discount, (int, float)):
                has_value = True
            elif isinstance(raw_discount, str) and raw_discount.strip():
                has_value = True

            if has_value:
                try:
                    discount_value = round(float(raw_discount), 2)
                except (TypeError, ValueError):
                    return jsonify({"message": "Discount price must be a valid number."}), 400

                if discount_value <= 0:
                    return (
                        jsonify({"message": "Discount price must be greater than zero."}),
                        400,
                    )

                comparison_price = updates.get("price", existing_price_value)
                try:
                    comparison_price = float(comparison_price)
                except (TypeError, ValueError):
                    comparison_price = existing_price_value

                if discount_value >= comparison_price:
                    return (
                        jsonify(
                            {"message": "Discount price must be lower than the standard price."}
                        ),
                        400,
                    )

            updates["discount_price"] = discount_value

        categories_changed = any(
            key in payload for key in ("category_ids", "new_categories", "categories")
        )
        if categories_changed:
            owner_email = normalize_email(current_user.get("email"))
            resolved_category_ids, category_error = resolve_category_ids_from_payload(
                payload, owner_email
            )
            if category_error:
                return jsonify({"message": category_error}), 400
            updates["category_ids"] = resolved_category_ids

        if "variations" in payload:
            variations_data, variations_error = normalize_variations_input(
                payload.get("variations")
            )
            if variations_error:
                return jsonify({"message": variations_error}), 400
            updates["variations"] = variations_data

        saved_new_filenames, image_error = save_product_images(incoming_files)
        if image_error:
            return jsonify({"message": image_error}), 400

        def unique_preserve(items: List[str]) -> List[str]:
            seen = set()
            result: List[str] = []
            for item in items:
                if not item or item in seen:
                    continue
                seen.add(item)
                result.append(item)
            return result

        next_filenames = unique_preserve(retained_filenames + saved_new_filenames)

        if not next_filenames:
            if existing_filenames:
                if saved_new_filenames:
                    remove_product_image(saved_new_filenames)
                return jsonify({"message": "Please provide at least one product image."}), 400
            next_filenames = list(existing_filenames)

        images_changed = next_filenames != existing_filenames

        if images_changed:
            retained_set = set(next_filenames)
            removed_filenames = [
                filename for filename in existing_filenames if filename not in retained_set
            ]
            updates["image_filenames"] = next_filenames
            updates["image_filename"] = next_filenames[0]

        if not updates:
            return jsonify({"message": "No product changes detected."}), 400

        updates["updated_at"] = datetime.utcnow()

        db.products.update_one(
            {"_id": product_document["_id"]},
            {"$set": updates},
        )

        updated_product = db.products.find_one({"_id": product_document["_id"]})

        if removed_filenames:
            remove_product_image(removed_filenames)

        return jsonify(
            {
                "message": "Product updated successfully.",
                "product": serialize_product(
                    updated_product,
                    category_map=fetch_categories_by_ids(
                        updated_product.get("category_ids")
                    ),
                ),
            }
        )

    @app.route("/api/products/<product_id>", methods=["DELETE"])
    @jwt_required()
    def delete_product(product_id: str):
        current_user, permission_error = require_role("seller", "admin")
        if permission_error:
            return permission_error

        product_document, load_error = fetch_product(product_id)
        if load_error:
            return load_error

        if not can_manage_product(product_document, current_user):
            return (
                jsonify({"message": "You do not have permission to delete this product."}),
                403,
            )

        db.products.delete_one({"_id": product_document["_id"]})
        stored_filenames: List[str] = []
        raw_filenames = product_document.get("image_filenames")
        if isinstance(raw_filenames, list):
            stored_filenames.extend(str(filename) for filename in raw_filenames if filename)
        legacy_filename = product_document.get("image_filename")
        if legacy_filename:
            normalized_legacy = str(legacy_filename)
            if normalized_legacy not in stored_filenames:
                stored_filenames.append(normalized_legacy)

        remove_product_image(stored_filenames)

        return jsonify({"message": "Product removed successfully."})

    # Categories
    @app.route("/api/categories", methods=["GET"])
    def list_categories_route():
        category_documents = list(db.categories.find().sort("name", 1))
        product_counts = build_category_product_counts()
        categories = [
            serialize_category(document, product_counts=product_counts)
            for document in category_documents
        ]
        return jsonify({"categories": categories})

    @app.route("/api/categories", methods=["POST"])
    @jwt_required()
    def create_category_route():
        current_user, permission_error = require_role("seller", "admin")
        if permission_error:
            return permission_error

        payload = request.get_json(silent=True) or {}
        name_value = normalize_category_name(payload.get("name"))
        if len(name_value) < 2:
            return jsonify({"message": "Please provide a category name with at least two characters."}), 400

        creator_email = normalize_email(current_user.get("email"))
        category_document, was_created, category_error = get_or_create_category(
            name_value, creator_email
        )
        if category_error:
            return jsonify({"message": category_error}), 400

        product_counts = build_category_product_counts()
        message = (
            "Category created successfully."
            if was_created
            else "That category already exists, so we re-used it."
        )
        status_code = 201 if was_created else 200

        return (
            jsonify(
                {
                    "message": message,
                    "category": serialize_category(
                        category_document, product_counts=product_counts
                    ),
                }
            ),
            status_code,
        )

    @app.route("/api/categories/<category_id>", methods=["DELETE"])
    @jwt_required()
    def delete_category_route(category_id: str):
        current_user, permission_error = require_role("seller", "admin")
        if permission_error:
            return permission_error

        try:
            category_object_id = ObjectId(category_id)
        except (InvalidId, TypeError):
            return jsonify({"message": "Invalid category identifier."}), 400

        category_document = db.categories.find_one({"_id": category_object_id})
        if not category_document:
            return jsonify({"message": "Category not found."}), 404

        db.categories.delete_one({"_id": category_object_id})
        db.products.update_many(
            {"category_ids": category_object_id},
            {"$pull": {"category_ids": category_object_id}},
        )

        product_counts = build_category_product_counts()
        normalized_counts = {
            str(key): int(value) for key, value in product_counts.items()
        }

        return jsonify(
            {
                "message": f'"{category_document.get("name", "Category")}" has been removed from the catalog.',
                "category": {"id": str(category_object_id)},
                "product_counts": normalized_counts,
            }
        )

    # Checkout
    @app.route("/api/checkout", methods=["POST"])
    def checkout():
        verify_jwt_in_request(optional=True)
        current_user_email = get_jwt_identity()
        user_document = (
            db.users.find_one({"email": current_user_email})
            if current_user_email
            else None
        )

        payload = request.get_json(silent=True) or {}
        items = payload.get("items", [])

        if not isinstance(items, list) or not items:
            return jsonify({"message": "Add at least one item to checkout."}), 400

        normalized_items = []
        for entry in items:
            normalized_entry = normalize_order_item(entry)
            if normalized_entry:
                normalized_items.append(normalized_entry)

        if not normalized_items:
            return jsonify({"message": "Add at least one item to checkout."}), 400

        customer_payload = payload.get("customer")
        if not isinstance(customer_payload, dict):
            customer_payload = {}

        def clean_text(value: Optional[str]) -> str:
            return str(value or "").strip()

        name_source = customer_payload.get("name")
        email_source = customer_payload.get("email")
        phone_source = customer_payload.get("phone")

        if not name_source and user_document:
            name_source = user_document.get("name")
        if not email_source and user_document:
            email_source = user_document.get("email")
        if not phone_source and user_document:
            phone_source = user_document.get("phone")

        customer_name = clean_text(name_source)
        customer_email = normalize_email(email_source)
        customer_phone = clean_text(phone_source)

        if not customer_name:
            return jsonify({"message": "Please provide the recipient name for delivery."}), 400
        if not is_valid_email(customer_email):
            return jsonify(
                {"message": "Please provide a valid email address to receive updates."}
            ), 400

        address_payload = payload.get("address")
        if not isinstance(address_payload, dict):
            address_payload = {}
        submitted_address = normalize_address_payload(address_payload)
        stored_address = (
            normalize_address_payload(user_document.get("address"))
            if user_document and user_document.get("address")
            else {}
        )
        normalized_stored_address = (
            stored_address if is_complete_address(stored_address) else {}
        )

        if submitted_address and not is_complete_address(submitted_address):
            return jsonify(
                {
                    "message": "Please complete all required delivery address fields before continuing."
                }
            ), 400

        delivery_address = submitted_address or normalized_stored_address
        if not delivery_address or not is_complete_address(delivery_address):
            return jsonify(
                {
                    "message": "Add your delivery address so we know where to send your order."
                }
            ), 400

        totals = calculate_order_totals(normalized_items)
        order_number = f"LIME-{uuid4().hex[:8].upper()}"

        customer_entry = {
            "name": customer_name,
            "email": customer_email,
            "phone": customer_phone,
            "type": "account" if current_user_email else "guest",
        }

        order_document = {
            "items": normalized_items,
            "created_at": datetime.utcnow(),
            "order_number": order_number,
            "subtotal": totals["subtotal"],
            "total_items": totals["total_items"],
            "customer": customer_entry,
            "shipping_address": delivery_address,
        }

        if current_user_email:
            order_document["user"] = current_user_email

        updated_token = None
        updated_profile = None
        requested_save = bool(payload.get("saveAddress"))
        should_update_profile = (
            current_user_email and requested_save and bool(submitted_address)
        )

        if should_update_profile:
            db.users.update_one(
                {"email": current_user_email},
                {"$set": {"address": submitted_address}},
            )
            refreshed_user = db.users.find_one({"email": current_user_email})
            if refreshed_user:
                updated_profile = serialize_user_profile(refreshed_user)
                updated_token = create_access_token(identity=current_user_email)

        insert_result = db.orders.insert_one(order_document)
        order_document["_id"] = insert_result.inserted_id

        response_payload = {
            "message": "Delivery details locked in. Continue to payment to finish your order.",
            "order": serialize_order(order_document),
        }

        if updated_profile and updated_token:
            response_payload["access_token"] = updated_token
            response_payload["user"] = updated_profile

        return jsonify(response_payload)

    @app.route("/api/orders", methods=["GET"])
    @jwt_required()
    def list_orders():
        current_user = get_jwt_identity()
        cursor = (
            db.orders.find({"user": current_user})
            .sort([("created_at", -1), ("_id", -1)])
            .limit(25)
        )
        orders = []
        for document in cursor:
            serialized = serialize_order(document)
            if serialized:
                orders.append(serialized)
        return jsonify({"orders": orders})

    # --- Admin Routes ---

    @app.route("/api/admin/users", methods=["GET"])
    @jwt_required()
    def list_users():
        _, admin_error = require_admin_user()
        if admin_error:
            return admin_error

        users = []
        for user in db.users.find():
            users.append(serialize_admin_user(user))

        return jsonify({"users": users})

    @app.route("/api/admin/users/<user_id>/role", methods=["PUT"])
    @jwt_required()
    def update_user_role(user_id: str):
        _, admin_error = require_admin_user()
        if admin_error:
            return admin_error

        payload = request.get_json(silent=True) or {}
        desired_role = str(payload.get("role", "")).strip().lower()

        if desired_role not in ALLOWED_USER_ROLES:
            return (
                jsonify({"message": "Role must be 'admin', 'seller', or 'standard'."}),
                400,
            )

        try:
            target_object_id = ObjectId(user_id)
        except (InvalidId, TypeError):
            return jsonify({"message": "Invalid user identifier."}), 400

        user_to_update = db.users.find_one({"_id": target_object_id})
        if not user_to_update:
            return jsonify({"message": "User not found."}), 404

        target_email = str(user_to_update.get("email", "")).strip().lower()
        if target_email == DEFAULT_ADMIN_EMAIL and desired_role != "admin":
            return (
                jsonify({"message": "The default administrator must remain an admin."}),
                400,
            )

        db.users.update_one(
            {"_id": target_object_id}, {"$set": {"role": desired_role}}
        )
        updated_user = db.users.find_one({"_id": target_object_id})

        return jsonify(
            {
                "message": f"Role updated to {desired_role}.",
                "user": serialize_admin_user(updated_user),
            }
        )

    @app.route("/api/admin/users/<user_id>/verify", methods=["PUT"])
    @jwt_required()
    def admin_update_user_verification(user_id: str):
        _, admin_error = require_admin_user()
        if admin_error:
            return admin_error

        try:
            target_object_id = ObjectId(user_id)
        except (InvalidId, TypeError):
            return jsonify({"message": "Invalid user identifier."}), 400

        payload = request.get_json(silent=True) or {}
        desired_state = payload.get("verified")
        if desired_state is None:
            desired_state = True
        desired_state = bool(desired_state)

        user_document = db.users.find_one({"_id": target_object_id})
        if not user_document:
            return jsonify({"message": "User not found."}), 404

        update_fields = {
            "email_verified": desired_state,
            "verified_at": datetime.utcnow() if desired_state else None,
        }

        db.users.update_one({"_id": target_object_id}, {"$set": update_fields})

        if desired_state:
            email_verification_collection.delete_one(
                {"email": normalize_email(user_document.get("email"))}
            )

        updated_user = db.users.find_one({"_id": target_object_id})
        message = (
            "Email marked as verified."
            if desired_state
            else "User email marked as unverified."
        )

        return jsonify(
            {
                "message": message,
                "user": serialize_admin_user(updated_user),
            }
        )

    @app.route("/api/admin/users/<user_id>/avatar", methods=["DELETE"])
    @jwt_required()
    def admin_remove_user_avatar(user_id: str):
        _, admin_error = require_admin_user()
        if admin_error:
            return admin_error

        try:
            target_object_id = ObjectId(user_id)
        except (InvalidId, TypeError):
            return jsonify({"message": "Invalid user identifier."}), 400

        user_to_update = db.users.find_one({"_id": target_object_id})
        if not user_to_update:
            return jsonify({"message": "User not found."}), 404

        avatar_filename = user_to_update.get("avatar_filename")
        unset_operations: Dict[str, str] = {}

        if avatar_filename:
            remove_product_image(avatar_filename)
            unset_operations["avatar_filename"] = ""

        if user_to_update.get("avatar_updated_at"):
            unset_operations["avatar_updated_at"] = ""

        if unset_operations:
            db.users.update_one(
                {"_id": target_object_id},
                {"$unset": unset_operations},
            )

        updated_user = db.users.find_one({"_id": target_object_id})
        message = (
            "Profile picture removed successfully."
            if avatar_filename
            else "No profile picture on file for this user."
        )

        return jsonify({"message": message, "user": serialize_admin_user(updated_user)})

    @app.route("/api/admin/users/<user_id>", methods=["DELETE"])
    @jwt_required()
    def admin_delete_user(user_id: str):
        _, admin_error = require_admin_user()
        if admin_error:
            return admin_error

        try:
            target_object_id = ObjectId(user_id)
        except (InvalidId, TypeError):
            return jsonify({"message": "Invalid user identifier."}), 400

        user_to_delete = db.users.find_one({"_id": target_object_id})
        if not user_to_delete:
            return jsonify({"message": "User not found."}), 404

        target_email = normalize_email(user_to_delete.get("email"))
        if target_email == DEFAULT_ADMIN_EMAIL:
            return (
                jsonify(
                    {"message": "The default administrator account cannot be deleted."}
                ),
                400,
            )

        avatar_filename = user_to_delete.get("avatar_filename")
        if avatar_filename:
            remove_product_image(avatar_filename)

        db.users.delete_one({"_id": target_object_id})

        display_name = user_to_delete.get("name") or "User"
        return jsonify(
            {
                "message": f"{display_name} has been removed from the directory.",
                "user": {"id": str(target_object_id)},
            }
        )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
