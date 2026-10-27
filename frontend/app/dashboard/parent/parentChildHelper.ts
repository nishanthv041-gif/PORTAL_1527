import { cache } from "react";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { cookies } from "next/headers";

async function queryParentFromDb(userId: string) {
  return prisma.parent.findUnique({
    where: { userId },
    include: {
      children: {
        include: {
          student: {
            include: {
              class: {
                include: {
                  classTeacher: {
                    include: { user: true }
                  },
                  subjects: {
                    include: {
                      teacher: { include: { user: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
}

type ParentWithRelations = NonNullable<Awaited<ReturnType<typeof queryParentFromDb>>>;

// 60-second TTL cache for parent records across tab navigations
const parentRecordCache = new Map<string, { data: ParentWithRelations; expiresAt: number }>();

export function invalidateParentRecordCache(userId?: string) {
  if (userId) parentRecordCache.delete(userId);
  else parentRecordCache.clear();
}

export const getParentAndSelectedChild = cache(async (searchParamsChildId?: string) => {
  const session = await getServerSession(getAuthOptions());
  if (!session) return { session: null, parent: null, children: [], selectedChild: null };

  const cookieStore = await cookies();
  const cookieChildId = cookieStore.get("selectedChildId")?.value;

  const now = Date.now();
  const cached = parentRecordCache.get(session.user.id);
  let parent = cached && cached.expiresAt > now ? cached.data : null;

  if (!parent) {
    const fresh = await queryParentFromDb(session.user.id);
    if (fresh) {
      parent = fresh;
      parentRecordCache.set(session.user.id, { data: fresh, expiresAt: now + 60_000 });
    }
  }

  if (!parent || parent.children.length === 0) {
    return { session, parent, children: [], selectedChild: null };
  }

  const children = parent.children.map(c => c.student);
  const targetId = searchParamsChildId || cookieChildId;

  let selectedChild = children[0];
  if (targetId) {
    const found = children.find(c => c.id === targetId);
    if (found) selectedChild = found;
  }

  return { session, parent, children, selectedChild };
});

