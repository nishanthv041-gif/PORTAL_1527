"use server";

import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function bulkCreateUsers(type: "teacher" | "student", payload: Record<string, unknown>[]) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

  let successCount = 0;
  const errors: string[] = [];

  try {
    for (let i = 0; i < payload.length; i++) {
      const row = payload[i] as Record<string, unknown>;
      try {
        if (type === "teacher") {
          const { email, password, firstName, lastName, phone, joiningDate, qualification } = row as { email?: string, password?: string | number, firstName?: string, lastName?: string, phone?: string | number, joiningDate?: string | Date, qualification?: string };
          if (!email || !password || !firstName || !lastName) {
            throw new Error("Missing required fields");
          }

          const existingUser = await prisma.user.findUnique({ where: { email } });
          if (existingUser) throw new Error(`Email ${email} already exists`);

          const hashedPassword = await hash(password.toString(), 10);
          
          await prisma.user.create({
            data: {
              email,
              password: hashedPassword,
              name: `${firstName} ${lastName}`,
              role: "TEACHER",
              teacher: {
                create: {
                  phone: phone?.toString() || "",
                  joinDate: joiningDate ? new Date(joiningDate) : new Date(),
                  qualification: qualification || ""
                }
              }
            }
          });
          successCount++;
        } else if (type === "student") {
          const {
            parentEmail, parentPassword, parentFirstName, parentLastName, parentPhone, parentAddress, parentOccupation,
            studentFirstName, studentLastName, studentRollNo, studentDob, classId, admissionNo
          } = row as { parentEmail?: string, parentPassword?: string | number, parentFirstName?: string, parentLastName?: string, parentPhone?: string | number, parentAddress?: string, parentOccupation?: string, studentFirstName?: string, studentLastName?: string, studentRollNo?: string | number, studentDob?: string | Date, classId?: string, admissionNo?: string | number };

          if (!parentEmail || !parentPassword || !studentFirstName || !studentLastName || !classId) {
            throw new Error("Missing required fields");
          }

          let parentUser = await prisma.user.findUnique({ where: { email: parentEmail } });
          let parentId;

          if (!parentUser) {
            const hashedPassword = await hash(parentPassword.toString(), 10);
            parentUser = await prisma.user.create({
              data: {
                email: parentEmail,
                password: hashedPassword,
                name: `${parentFirstName} ${parentLastName}`,
                role: "PARENT",
                parent: {
                  create: {
                    phone: parentPhone?.toString() || "",
                    occupation: parentOccupation || ""
                  }
                }
              }
            });
            const pData = await prisma.parent.findUnique({ where: { userId: parentUser.id } });
            parentId = pData!.id;
          } else {
            const pData = await prisma.parent.findUnique({ where: { userId: parentUser.id } });
            if (!pData) throw new Error(`User ${parentEmail} is not a parent`);
            parentId = pData.id;
          }

          await prisma.student.create({
            data: {
              firstName: studentFirstName,
              lastName: studentLastName,
              rollNumber: studentRollNo?.toString() || "",
              admissionNo: admissionNo?.toString() || `ADM${studentRollNo}`,
              dateOfBirth: studentDob ? new Date(studentDob) : new Date(),
              address: parentAddress || "",
              classId,
              parents: {
                create: { parentId }
              }
            }
          });
          successCount++;
        }
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { success: true, count: successCount, errors: errors.length > 0 ? errors : undefined };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to process upload" };
  }
}
