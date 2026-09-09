import styles from "../../dashboard.module.css";

export default function ParentFeesPage() {
  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Fees</h1>
      <div className={styles.chartCard}>
        <p style={{ opacity: 0.7 }}>Fee payment and history coming soon.</p>
      </div>
    </div>
  );
}
