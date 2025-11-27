import requests
import json

url = "http://localhost:5000/api/payments/sumup/create_checkout"
payload = {
    "items": [
        {
            "id": "test-product-id",
            "name": "Test Product",
            "price": 10.00,
            "quantity": 1
        }
    ],
    "customer": {
        "email": "test@example.com",
        "name": "Test User"
    },
    "shippingAddress": {
        "country": "NL",
        "city": "Eindhoven",
        "postcode": "1234AB",
        "line1": "Test Street 1"
    }
}

try:
    print(f"Sending POST request to {url}...")
    response = requests.post(url, json=payload)
    print(f"Status Code: {response.status_code}")
    print("Response Body:")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
