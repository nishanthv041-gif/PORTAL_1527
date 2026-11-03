import styles from "../dashboard.module.css";

export default function TeacherDashboardLoading() {
  return (
    <div className={styles.dashboard} style={{ opacity: 0.9 }}>
      {/* Title */}
      <div 
        style={{ 
          height: '32px', 
          width: '240px', 
          borderRadius: '8px', 
          marginBottom: '1.25rem',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'teacherSkeletonShimmer 1.4s infinite ease-in-out'
        }} 
      />

      {/* Teacher Profile / Attendance quick bar skeleton */}
      <div 
        style={{ 
          height: '110px', 
          borderRadius: '16px', 
          border: '1px solid var(--border)',
          marginBottom: '1.5rem',
          background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.10) 50%, var(--card) 75%)',
          backgroundSize: '200% 100%',
          animation: 'teacherSkeletonShimmer 1.4s infinite ease-in-out'
        }} 
      />

      {/* Classes / Timetable Today Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {[1, 2, 3, 4].map((i) => (
          <div 
            key={i} 
            style={{ 
              height: '160px', 
              borderRadius: '14px', 
              border: '1px solid var(--border)',
              background: 'linear-gradient(90deg, var(--card) 25%, rgba(99, 102, 241, 0.08) 50%, var(--card) 75%)',
              backgroundSize: '200% 100%',
              animation: 'teacherSkeletonShimmer 1.4s infinite ease-in-out'
            }} 
          />
        ))}
      </div>

      <style>{`
        @keyframes teacherSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

