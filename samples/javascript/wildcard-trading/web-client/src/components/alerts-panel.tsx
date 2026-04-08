import { useAlerts } from "../hooks/wps-provider";

export default function AlertsPanel() {
  const alerts = useAlerts();

  return (
    <div className="bg-gray-900">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="size-2 rounded-full bg-red-500 animate-pulse"></div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Risk Bot Alerts
        </h3>
        {alerts.length > 0 && (
          <span className="text-xs text-gray-500">({alerts.length})</span>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {alerts.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">
            No alerts. Bots are monitoring all accounts via wildcard
            subscription
          </p>
        ) : (
          <div className="divide-y divide-gray-800">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-2 animate-alert-highlight"
              >
                <span
                  className={`mt-0.5 shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${
                    alert.severity === "critical"
                      ? "bg-red-900/60 text-red-400"
                      : "bg-amber-900/60 text-amber-400"
                  }`}
                >
                  {alert.botName}
                </span>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {alert.message}
                </p>
                <span className="shrink-0 text-xs text-gray-600 tabular-nums ml-auto">
                  {new Date(alert.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
