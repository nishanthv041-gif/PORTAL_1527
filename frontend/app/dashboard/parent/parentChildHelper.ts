import { cache } from "react";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { cookies } from "next/headers";

export const getParentAndSelectedChild = cache(async (searchParamsChildId?: string) => {
  const session = await getServerSession(getAuthOptions());
  if (!session) return { session: null, parent: null, children: [], selectedChild: null };

  const cookieStore = await cookies();
  const cookieChildId = cookieStore.get("selectedChildId")?.value;

  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
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

