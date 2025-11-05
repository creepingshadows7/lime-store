import os
from datetime import datetime, timedelta
from typing import Dict, Optional

import bcrypt
from dotenv import load_dotenv
from flask import Flask, jsonify, request
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
            "image_url": "https://images.unsplash.com/photo-1527169402691-feff5539e52c?auto=format&fit=crop&w=900&q=80",
        },
        {
            "name": "Key Lime Cloud Tart",
            "price": 18.0,
            "description": "Feather-light tart with whipped mascarpone and candied lime zest.",
            "image_url": "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=900&q=80",
        },
        {
            "name": "Citrus Grove Bonbons",
            "price": 9.75,
            "description": "Hand painted white chocolate bonbons with a tangy lime curd center.",
            "image_url": "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=900&q=80",
        },
        {
            "name": "Verdant Velvet Cheesecake",
            "price": 22.5,
            "description": "Baked lime cheesecake with pistachio crumb and kaffir lime cream.",
            "image_url": "https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?auto=format&fit=crop&w=900&q=80",
        },
        {
            "name": "Glacier Lime Sorbet",
            "price": 6.5,
            "description": "Icy sorbet spun with Tahitian vanilla and crystallized lime peel.",
            "image_url": "https://images.unsplash.com/photo-1527169409092-72a3a99589aa?auto=format&fit=crop&w=900&q=80",
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
            documents.append(
                {
                    "name": product.get("name", ""),
                    "price": float(product.get("price", 0) or 0),
                    "description": product.get("description", ""),
                    "image_url": product.get("image_url", ""),
                    "created_at": timestamp,
                    "created_by": DEFAULT_ADMIN_EMAIL,
                }
            )

        if documents:
            db.products.insert_many(documents)

    def serialize_product(product_document):
        created_at = product_document.get("created_at")
        try:
            price_value = float(product_document.get("price", 0) or 0)
        except (TypeError, ValueError):
            price_value = 0.0

        return {
            "id": str(product_document.get("_id")),
            "name": product_document.get("name", ""),
            "price": f"{price_value:.2f}",
            "description": product_document.get("description", ""),
            "image_url": product_document.get("image_url", ""),
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else None,
            "created_by": product_document.get("created_by", ""),
        }

    # --- ROUTES ---

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
        product_docs = db.products.find().sort("created_at", -1)
        products = [serialize_product(document) for document in product_docs]
        return jsonify({"products": products})

    @app.route("/api/products", methods=["POST"])
    @jwt_required()
    def create_product():
        current_user, permission_error = require_role("seller", "admin")
        if permission_error:
            return permission_error

        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name", "")).strip()
        description = str(payload.get("description", "")).strip()
        image_url = str(payload.get("image_url", "")).strip()
        raw_price = payload.get("price", "")

        if not name:
            return jsonify({"message": "A product name is required."}), 400

        try:
            price_value = round(float(raw_price), 2)
        except (TypeError, ValueError):
            return jsonify({"message": "Price must be a valid number."}), 400

        if price_value <= 0:
            return jsonify({"message": "Price must be greater than zero."}), 400

        product_document = {
            "name": name,
            "description": description,
            "image_url": image_url,
            "price": price_value,
            "created_at": datetime.utcnow(),
            "created_by": normalize_email(current_user.get("email")),
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
