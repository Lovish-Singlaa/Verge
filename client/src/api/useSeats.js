import { useState } from "react";
import { axios_instance } from "../lib/axios/axios";
import { errorToast } from "../lib/toast";

const useSeats = () => {
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const getSeats = async (callback) => {
    setSeatsLoading(true);

    try {
      const response = await axios_instance.get("/api/seats");

      if (![200, 201].includes(response?.status)) {
        console.error("[useSeats] Error status:", response?.status);
        errorToast("Error fetching seats");
        callback(null, { message: "Error fetching seats" });
        return;
      }

      callback(response?.data, null);
    } catch (error) {
      console.error("[useSeats] Fetch seats error:", error);
      console.error("[useSeats] Error response:", error?.response?.data);
      errorToast(error?.response?.data?.message || "Failed to fetch seats");
      callback(null, error?.response?.data || error);
    } finally {
      setSeatsLoading(false);
    }
  };

  const bookSeat = async (payload, callback) => {
    setBookingLoading(true);

    try {
      const response = await axios_instance.post("/api/book-seat", payload);

      if (![200, 201].includes(response?.status)) {
        console.error("[useSeats] Book seat error status:", response?.status);
        const errorMsg = response?.data?.error || "Error booking seat";
        errorToast(errorMsg);
        callback(null, response?.data);
        return;
      }

      callback(response?.data, null);
    } catch (error) {
      console.error("[useSeats] Book seat error:", error);
      console.error("[useSeats] Error response:", error?.response?.data);
      
      const errorData = error?.response?.data;
      let errorMsg = "Failed to book seat";
      
      if (errorData?.error === "SEAT_ALREADY_TAKEN") {
        errorMsg = "Seat was just taken by another user!";
      } else if (errorData?.error === "SEAT_NOT_FOUND") {
        errorMsg = "Seat not found";
      } else if (errorData?.message) {
        errorMsg = errorData.message;
      }
      
      errorToast(errorMsg);
      callback(null, errorData || error);
    } finally {
      setBookingLoading(false);
    }
  };


  const payForBooking = async (payload, idempotencyKey, callback) => {
    setPaymentLoading(true);

    try {
      const headers = {};
      if (idempotencyKey) {
        headers["idempotency-key"] = idempotencyKey;
      }

      const response = await axios_instance.post("/api/pay", payload, { headers });

      if (![200, 201].includes(response?.status)) {
        console.error("[useSeats] Payment error status:", response?.status);
        errorToast("Payment failed");
        callback(null, response?.data);
        return;
      }

      callback(response?.data, null);
    } catch (error) {
      console.error("[useSeats] Payment error:", error);
      console.error("[useSeats] Error response:", error?.response?.data);
      
      const errorData = error?.response?.data;
      let errorMsg = "Payment failed. Please try again.";
      
      if (errorData?.status === "PAYMENT_FAILED") {
        errorMsg = "Seat reservation expired. Please try again.";
      } else if (errorData?.message) {
        errorMsg = errorData.message;
      }
      
      errorToast(errorMsg);
      callback(null, errorData || error);
    } finally {
      setPaymentLoading(false);
    }
  };

  const releaseHold = async (seatId, userId) => {
    try {
      await axios_instance.post("/api/release-hold", { seatId, userId });
    } catch (error) {
      console.error("[useSeats] Error releasing hold:", error);
    }
  };

  return {
    seatsLoading,
    bookingLoading,
    paymentLoading,
    getSeats,
    bookSeat,
    payForBooking,
    releaseHold,
  };
};

export default useSeats;
