import os
from datetime import datetime, timedelta
from typing import Dict, List

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

load_dotenv()


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

    products: List[Dict[str, str]] = [
        {"id": "lime-ade", "name": "Zesty Lime Ade", "price": "4.99"},
        {"id": "lime-cake", "name": "Key Lime Cheesecake", "price": "12.50"},
        {"id": "lime-pie", "name": "Classic Lime Pie", "price": "9.50"},
    ]

    # --- ROUTES ---

    # Register
    @app.route("/api/register", methods=["POST"])
    def register():
        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email", "")).strip().lower()
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
        user_document = {
            "email": email,
            "name": name,
            "password": hashed_pw,
            "created_at": datetime.utcnow(),
        }

        if phone:
            user_document["phone"] = phone

        db.users.insert_one(user_document)

        return jsonify({"message": "User registered successfully."}), 201

    # Login
    @app.route("/api/login", methods=["POST"])
    def login():
        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))

        if not email or not password:
            return jsonify({"message": "Email and password are required."}), 400

        user = db.users.find_one({"email": email})
        if not user or not bcrypt.checkpw(password.encode("utf-8"), user["password"]):
            return jsonify({"message": "Invalid credentials"}), 401

        token = create_access_token(identity=email)
        user_profile = {
            "name": user.get("name", ""),
            "email": user["email"],
            "phone": user.get("phone", ""),
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
                    }
                }
            )

        payload = request.get_json(silent=True) or {}

        desired_email = str(payload.get("email", current_email)).strip().lower()
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
        return jsonify({"products": products})

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

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
