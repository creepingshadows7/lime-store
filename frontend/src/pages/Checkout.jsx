import { useState } from "react";
import apiClient from "../api/client";

const Checkout = () => {
  const [items, setItems] = useState(["lime-ade"]);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCheckout = async () => {
    setIsSubmitting(true);
    setMessage("");
    try {
      const { data } = await apiClient.post("/api/checkout", { items });
      setMessage(data.message);
    } catch (err) {
      if (err.response?.status === 401) {
        setMessage("You need to log in before checking out.");
      } else {
        setMessage("Checkout failed. Try again later.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h1>Checkout</h1>
      <p>Items ready to ship: {items.join(", ")}</p>
      <button onClick={handleCheckout} disabled={isSubmitting}>
        {isSubmitting ? "Processing..." : "Complete Checkout"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
};

export default Checkout;
