import styles from "./ParentDashboard.module.css";

export default function ParentDashboardLoading() {
  return (
    <div className={styles.container} style={{ opacity: 0.9 }}>
      {/* Title */}
      <div 
        style={{ 
          height: '32px', 
          width: '240px', 
          borderRadius: '8px', 
          marginBottom: '1.25rem',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'parentSkeletonShimmer 1.4s infinite ease-in-out'
        }} 
      />

      {/* Child Switcher Banner */}
      <div 
        style={{ 
          height: '110px', 
          borderRadius: '16px', 
          border: '1px solid var(--border)',
          marginBottom: '1.5rem',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.10) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'parentSkeletonShimmer 1.4s infinite ease-in-out'
        }} 
      />

      {/* Grid: Attendance summary & Timetable today */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        <div 
          style={{ 
            height: '220px', 
            borderRadius: '16px', 
            border: '1px solid var(--border)',
            background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
            backgroundSize: '200% 100%',
            animation: 'parentSkeletonShimmer 1.4s infinite ease-in-out'
          }} 
        />
        <div 
          style={{ 
            height: '220px', 
            borderRadius: '16px', 
            border: '1px solid var(--border)',
            background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
            backgroundSize: '200% 100%',
            animation: 'parentSkeletonShimmer 1.4s infinite ease-in-out'
          }} 
        />
      </div>

      <style>{`
        @keyframes parentSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
