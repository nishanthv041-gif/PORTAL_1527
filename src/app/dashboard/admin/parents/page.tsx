import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ParentListClient from "./ParentListClient";

export default async function AdminParentsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const parents = await prisma.parent.findMany({
    orderBy: { user: { name: 'asc' } },
    include: {
      user: true,
      children: {
        include: {
          student: { include: { class: true } }
        }
      }
    }
  });

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Parents</h1>
        <p style={{ color: 'var(--text-secondary)' }}>To create new parents, please use the &quot;Create New Roles&quot; section in the sidebar.</p>
      </div>

      <ParentListClient parents={parents} classes={classes} />
    </div>
  );
}
