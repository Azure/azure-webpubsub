import { useState } from "react";

interface Props {
  onPlaceOrder: (order: { ticker: string; quantity: number }) => Promise<void>;
  isLoading?: boolean;
}

export default function PlaceOrder({ onPlaceOrder, isLoading }: Props) {
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");

  const handlePlaceOrder = async () => {
    if (!ticker || !quantity) return;
    await onPlaceOrder({ ticker, quantity: Number(quantity) });
    setTicker("");
    setQuantity("");
  };

  return (
    <div className="flex gap-2 justify-end">
      <select
        className="px-2 py-1 text-xs border border-gray-200 rounded h-7 text-gray-600 bg-white"
        title="ticker"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
      >
        <option value="">Ticker</option>
        <option value="APXC">APXC</option>
        <option value="MTBK">MTBK</option>
        <option value="NBFN">NBFN</option>
        <option value="QCRD">QCRD</option>
      </select>
      <select
        className="px-2 py-1 text-xs border border-gray-200 rounded h-7 text-gray-600 bg-white"
        title="quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      >
        <option value="">Qty</option>
        <option value="5">5</option>
        <option value="10">10</option>
        <option value="15">15</option>
        <option value="20">20</option>
      </select>
      <button
        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed h-7 flex-1"
        disabled={!ticker || !quantity}
        onClick={handlePlaceOrder}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4 mx-auto text-white"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : (
          "Place order"
        )}
      </button>
    </div>
  );
}
