import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4
from urllib.parse import urljoin, urlparse

import bcrypt
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
)
from flask_pymongo import PyMongo
from bson import ObjectId
from bson.errors import InvalidId
from werkzeug.utils import secure_filename

load_dotenv()

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

    def normalize_email(value: Optional[str]) -> str:
        return str(value or "").strip().lower()

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

    def serialize_product(product_document, user_names=None):
        created_at = product_document.get("created_at")
        try:
            price_value = float(product_document.get("price", 0) or 0)
        except (TypeError, ValueError):
            price_value = 0.0

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
            "description": product_document.get("description", ""),
            "image_url": primary_image_url,
            "image_urls": image_urls,
            "image_filenames": image_filenames,
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else None,
            "created_by": owner_email,
            "created_by_name": owner_name,
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

    # Register
    @app.route("/api/register", methods=["POST"])
    def register():
        payload = request.get_json(silent=True) or {}
        email = normalize_email(payload.get("email"))
        name = str(payload.get("name", "")).strip()
        password = str(payload.get("password", ""))
        phone = str(payload.get("phone", "")).strip()

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
        }

        if phone:
            user_document["phone"] = phone

        db.users.insert_one(user_document)

        return jsonify({"message": "User registered successfully."}), 201

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
            user = db.users.find_one({"_id": user["_id"]})

        token = create_access_token(identity=email)
        user_profile = {
            "name": user.get("name", ""),
            "email": user["email"],
            "phone": user.get("phone", ""),
            "role": get_user_role(user),
        }
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
                    "user": {
                        "name": user.get("name", ""),
                        "email": user.get("email", ""),
                        "phone": user.get("phone", ""),
                        "role": get_user_role(user),
                    }
                }
            )

        payload = request.get_json(silent=True) or {}

        desired_email = normalize_email(payload.get("email", current_email))
        desired_name = str(payload.get("name", user.get("name", ""))).strip()
        desired_phone = str(payload.get("phone", user.get("phone", ""))).strip()
        new_password = str(payload.get("password", "")).strip()

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

        token = create_access_token(identity=updated_email)
        user_profile = {
            "name": updated_user.get("name", ""),
            "email": updated_user.get("email", ""),
            "phone": updated_user.get("phone", ""),
            "role": get_user_role(updated_user),
        }
        return jsonify(
            {
                "message": "Account updated successfully.",
                "access_token": token,
                "user": user_profile,
            }
        )

    # Products
    @app.route("/api/products", methods=["GET"])
    def list_products():
        ensure_seed_products()
        product_docs = list(db.products.find().sort("created_at", -1))

        author_emails = {
            normalize_email(document.get("created_by"))
            for document in product_docs
            if document.get("created_by")
        }
        user_names: Dict[str, str] = {}
        if author_emails:
            for user_document in db.users.find({"email": {"$in": list(author_emails)}}):
                normalized_email = normalize_email(user_document.get("email"))
                if normalized_email:
                    user_names[normalized_email] = user_document.get("name", "") or ""
        if DEFAULT_ADMIN_EMAIL in author_emails:
            user_names.setdefault(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME)

        products = [
            serialize_product(document, user_names=user_names) for document in product_docs
        ]
        return jsonify({"products": products})

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

        return jsonify(
            {"product": serialize_product(product_document, user_names=user_names)}
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

        saved_filenames, image_error = save_product_images(image_files)
        if image_error:
            return jsonify({"message": image_error}), 400

        if not saved_filenames:
            return jsonify({"message": "Please upload at least one image for this product."}), 400

        product_document = {
            "name": name,
            "description": description,
            "price": price_value,
            "created_at": datetime.utcnow(),
            "created_by": normalize_email(current_user.get("email")),
            "image_filenames": saved_filenames,
            "image_filename": saved_filenames[0],
        }

        result = db.products.insert_one(product_document)
        created_product = db.products.find_one({"_id": result.inserted_id})

        return (
            jsonify(
                {
                    "message": "Product added successfully.",
                    "product": serialize_product(created_product),
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
                "product": serialize_product(updated_product),
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

    # Checkout
    @app.route("/api/checkout", methods=["POST"])
    @jwt_required()
    def checkout():
        current_user = get_jwt_identity()
        payload = request.get_json(silent=True) or {}
        items = payload.get("items", [])

        if not isinstance(items, list) or not items:
            return jsonify({"message": "Add at least one item to checkout."}), 400

        db.orders.insert_one({"user": current_user, "items": items})

        return jsonify(
            {
                "message": f"Checkout successful for {current_user}.",
                "items": items,
            }
        )

    # --- Admin Routes ---

    @app.route("/api/admin/users", methods=["GET"])
    @jwt_required()
    def list_users():
        _, admin_error = require_admin_user()
        if admin_error:
            return admin_error

        users = []
        for user in db.users.find():
            role = get_user_role(user)
            created_at = user.get("created_at")
            users.append(
                {
                    "id": str(user["_id"]),
                    "name": user.get("name", ""),
                    "email": user.get("email", ""),
                    "phone": user.get("phone", ""),
                    "role": role,
                    "created_at": created_at.isoformat() if isinstance(created_at, datetime) else None,
                }
            )

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
        created_at = updated_user.get("created_at")
        role = get_user_role(updated_user)

        return jsonify(
            {
                "message": f"Role updated to {desired_role}.",
                "user": {
                    "id": str(updated_user["_id"]),
                    "name": updated_user.get("name", ""),
                    "email": updated_user.get("email", ""),
                    "phone": updated_user.get("phone", ""),
                    "role": role,
                    "created_at": created_at.isoformat()
                    if isinstance(created_at, datetime)
                    else None,
                },
            }
        )

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
