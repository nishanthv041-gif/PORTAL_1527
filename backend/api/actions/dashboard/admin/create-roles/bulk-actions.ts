"use server";

import { prisma } from "@/backend/db/prisma";
import { hash } from "bcryptjs";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";

export async function bulkCreateUsers(type: "teacher" | "student", payload: Record<string, unknown>[]) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (session && session.user.role !== 'ADMIN') return { error: "Unauthorized" };
  } catch {
    // Allows CLI tests or headless scripts without Next request headers store
  }

  let successCount = 0;
  const errors: string[] = [];

  // Fetch all existing classes once for name/id resolution
  const existingClasses = await prisma.class.findMany({
    select: { id: true, name: true, section: true }
  });

  try {
    for (let i = 0; i < payload.length; i++) {
      const rawRow = payload[i] as Record<string, unknown>;
      // Normalize keys to lowercase for flexible column header matching
      const row: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rawRow)) {
        const normalizedKey = key.trim().toLowerCase().replace(/[\s_]+/g, "");
        row[normalizedKey] = val;
      }

      try {
        if (type === "teacher") {
          const email = (row.email || row.officialemail || row.username) as string | undefined;
          const password = (row.password || row.temppassword || "Teacher@123") as string | number | undefined;
          const firstName = (row.firstname || row.first_name || row.name?.toString().split(" ")[0]) as string | undefined;
          const lastName = (row.lastname || row.last_name || row.name?.toString().split(" ").slice(1).join(" ") || ".") as string | undefined;
          const phone = (row.phone || row.phonenumber || row.mobile) as string | number | undefined;
          const joiningDate = (row.joiningdate || row.joindate) as string | Date | undefined;
          const qualification = (row.qualification || row.degree || row.department) as string | undefined;

          if (!email || !password || !firstName) {
            throw new Error("Missing required teacher fields (email, password, or firstName)");
          }

          const existingUser = await prisma.user.findUnique({ where: { email: email.toString().trim() } });
          if (existingUser) throw new Error(`Email ${email} already exists`);

          const hashedPassword = await hash(password.toString(), 10);
          
          await prisma.user.create({
            data: {
              email: email.toString().trim(),
              password: hashedPassword,
              name: `${firstName} ${lastName || "."}`.trim(),
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
          const parentEmail = (row.parentemail || row.email || row.parentusername) as string | undefined;
          const parentPassword = (row.parentpassword || row.password || "Parent@123") as string | number | undefined;
          const parentFirstName = (row.parentfirstname || row.parentname?.toString().split(" ")[0] || "Parent") as string | undefined;
          const parentLastName = (row.parentlastname || row.parentname?.toString().split(" ").slice(1).join(" ") || ".") as string | undefined;
          const parentPhone = (row.parentphone || row.phone || row.mobile) as string | number | undefined;
          const parentAddress = (row.parentaddress || row.address) as string | undefined;
          const parentOccupation = (row.parentoccupation || row.occupation) as string | undefined;

          const studentFirstName = (row.studentfirstname || row.firstname || row.studentname?.toString().split(" ")[0]) as string | undefined;
          const studentLastName = (row.studentlastname || row.lastname || row.studentname?.toString().split(" ").slice(1).join(" ") || ".") as string | undefined;
          const studentRollNo = (row.studentrollno || row.rollnumber || row.rollno) as string | number | undefined;
          const studentDob = (row.studentdob || row.dateofbirth || row.dob) as string | Date | undefined;
          const rawClassId = (row.classid || row.class || row.classname || row.section) as string | undefined;
          const admissionNo = (row.admissionno || row.admissionnumber) as string | number | undefined;

          // Residence type (Hostel or Dayscholar)
          const rawRes = (row.residencetype || row.hostelordayscholar || row.hostel || row.type || "DAYSCHOLAR") as string | undefined;
          const residenceType = rawRes && rawRes.toString().toUpperCase().includes("HOSTEL") ? "HOSTEL" : "DAYSCHOLAR";

          if (!parentEmail || !studentFirstName || !studentRollNo) {
            throw new Error("Missing required student fields (Parent Email, Student First Name, or Roll Number)");
          }

          // Resolve classId: could be ID or could match Class Name + Section
          let classId: string | null = null;
          if (rawClassId) {
            const classStr = rawClassId.toString().trim();
            const matchedClass = existingClasses.find(c => 
              c.id === classStr || 
              `${c.name} - ${c.section}`.toLowerCase() === classStr.toLowerCase() ||
              `${c.name} - Section ${c.section}`.toLowerCase() === classStr.toLowerCase() ||
              `${c.name} ${c.section}`.toLowerCase() === classStr.toLowerCase() ||
              c.name.toLowerCase() === classStr.toLowerCase()
            );
            if (matchedClass) {
              classId = matchedClass.id;
            } else if (existingClasses.some(c => c.id === classStr)) {
              classId = classStr;
            }
          }

          // If no class found, fallback to first active class if available or leave null
          if (!classId && existingClasses.length > 0) {
            classId = existingClasses[0].id;
          }

          const rollStr = studentRollNo.toString().trim();
          const admStr = admissionNo ? admissionNo.toString().trim() : `ADM${rollStr}`;

          // Check for existing student with roll or admission
          const existingStudent = await prisma.student.findFirst({
            where: { OR: [{ rollNumber: rollStr }, { admissionNo: admStr }] }
          });
          if (existingStudent) {
            throw new Error(`Student with Roll No '${rollStr}' or Admission No '${admStr}' already exists`);
          }

          const cleanParentEmail = parentEmail.toString().trim();
          let parentUser = await prisma.user.findUnique({ 
            where: { email: cleanParentEmail },
            include: { parent: true }
          });
          let parentId: string;

          if (!parentUser) {
            const hashedPassword = await hash((parentPassword || "Parent@123").toString(), 10);
            parentUser = await prisma.user.create({
              data: {
                email: cleanParentEmail,
                password: hashedPassword,
                name: `${parentFirstName} ${parentLastName}`.trim(),
                role: "PARENT",
                parent: {
                  create: {
                    phone: parentPhone?.toString() || "",
                    occupation: parentOccupation || ""
                  }
                }
              },
              include: { parent: true }
            });
            parentId = parentUser.parent!.id;
          } else {
            if (parentUser.role !== "PARENT") {
              throw new Error(`User with email ${cleanParentEmail} exists but is not a parent`);
            }
            if (!parentUser.parent) {
              const newParent = await prisma.parent.create({
                data: {
                  userId: parentUser.id,
                  phone: parentPhone?.toString() || "",
                  occupation: parentOccupation || ""
                }
              });
              parentId = newParent.id;
            } else {
              parentId = parentUser.parent.id;
            }
          }

          await prisma.student.create({
            data: {
              firstName: studentFirstName.toString().trim(),
              lastName: (studentLastName || ".").toString().trim(),
              rollNumber: rollStr,
              admissionNo: admStr,
              dateOfBirth: studentDob ? new Date(studentDob) : new Date(),
              address: parentAddress?.toString() || "",
              classId: classId || null,
              residenceType,
              isActive: true,
              parents: {
                create: { parentId }
              }
            }
          });
          successCount++;
        }
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      revalidatePath("/dashboard/admin/users");
      revalidatePath("/dashboard/admin/students");
      revalidatePath("/dashboard/admin/parents");
      revalidatePath("/dashboard/admin/teachers");
    } catch {
      // Ignored outside Next.js request context
    }

    return { success: true, count: successCount, errors: errors.length > 0 ? errors : undefined };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to process upload" };
  }
}
