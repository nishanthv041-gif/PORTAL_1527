import styles from "../../dashboard.module.css";

export default function ParentTimetablePage() {
  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Timetable</h1>
      <div className={styles.chartCard}>
        <p style={{ opacity: 0.7 }}>Class timetable integration coming soon.</p>
      </div>
    </div>
  );
}
