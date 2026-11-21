import styles from "../dashboard.module.css";

export default function AdminDashboardLoading() {
  return (
    <div className={styles.dashboard} style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.25rem" }}>
      <div style={{
        width: "50px",
        height: "50px",
        borderRadius: "50%",
        border: "4px solid rgba(242, 184, 75, 0.2)",
        borderTopColor: "#f2b84b",
        animation: "spin 0.8s linear infinite"
      }} />
      <div style={{ textAlign: "center" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
          SRT Universal School
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Loading admin dashboard...
        </p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
