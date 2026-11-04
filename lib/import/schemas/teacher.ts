/**
 * Schema and strict alias definitions for Teacher bulk upload.
 * Solves Bug 1: Strict aliases ensure "NAME" never collides with "Class Teacher".
 */

import { z } from "zod";
import { isValidEmail, isValidIndianPhone } from "../normalizers";

export interface TargetFieldDef {
  key: string;
  label: string;
  required: boolean;
  description: string;
  aliases: string[]; // exact normalized token matches
}

export const TEACHER_TARGET_FIELDS: TargetFieldDef[] = [
  {
    key: "name",
    label: "Teacher Full Name",
    required: true,
    description: "Teacher's full name (e.g. S Vadivel, NandhiniS, Tharani R)",
    aliases: [
      "name",
      "full name",
      "teacher name",
      "staff name",
      "faculty name",
      "teacher's name",
      "staff's name",
      "faculty's name",
      "employee name",
    ],
  },
  {
    key: "gender",
    label: "Gender",
    required: false,
    description: "Gender (Male, Female, Other)",
    aliases: ["gender", "sex"],
  },
  {
    key: "phone",
    label: "Phone Number",
    required: true,
    description: "10-digit mobile number",
    aliases: [
      "phone number",
      "phone",
      "mobile number",
      "mobile",
      "contact number",
      "contact",
      "phone no",
      "mobile no",
    ],
  },
  {
    key: "qualification",
    label: "Qualification",
    required: false,
    description: "Educational degrees (e.g. B.Ed, M.Sc, M.A)",
    aliases: [
      "qualification",
      "qualifications",
      "degree",
      "degrees",
      "education",
      "educational qualification",
    ],
  },
  {
    key: "subject",
    label: "Subject",
    required: false,
    description: "Teaching subjects (e.g. Mathematics, Science, Tamil)",
    aliases: [
      "subject",
      "subjects",
      "teaching subject",
      "teaching subjects",
      "handling subject",
      "subject handled",
    ],
  },
  {
    key: "classTeacher",
    label: "Class Teacher",
    required: false,
    description: "Class assigned as class teacher (e.g. Class 1 - Section A, 1-A)",
    aliases: [
      "class teacher",
      "classteacher",
      "class teacher for",
      "class in charge",
      "class incharge",
      "assigned class",
      "section teacher",
    ],
  },
  {
    key: "userId",
    label: "User ID / Login Email",
    required: true,
    description: "Portal login identifier or email address",
    aliases: [
      "user id",
      "userid",
      "login id",
      "login email",
      "email id",
      "email",
      "portal id",
      "username",
    ],
  },
  {
    key: "password",
    label: "Password",
    required: true,
    description: "Initial portal password (minimum 6 characters)",
    aliases: [
      "password",
      "login password",
      "pass",
      "initial password",
      "pwd",
    ],
  },
  {
    key: "googleEmail",
    label: "Google Mail ID",
    required: false,
    description: "Sign in with Google Email Address",
    aliases: [
      "sign in with google mail id",
      "google mail id",
      "google mail",
      "google email",
      "gmail id",
      "gmail",
      "google account",
    ],
  },
];

export const TeacherRowSchema = z.object({
  name: z.string().min(1, "Teacher name is required."),
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().optional().default(""),
  gender: z.enum(["Female", "Male", "Other", "MALE", "FEMALE", "OTHER"]).default("Female"),
  phone: z.string().refine(p => isValidIndianPhone(p), {
    message: "Phone number must be a valid 10-digit Indian mobile number (e.g. 9876543210).",
  }),
  qualification: z.string().optional().default(""),
  subject: z.string().optional().default(""),
  subjects: z.array(z.string()).optional().default([]),
  classTeacher: z.string().optional().default(""),
  userId: z.string().min(1, "User ID is required.").refine(val => {
    // If contains @, must be a valid email format
    if (val.includes("@")) return isValidEmail(val);
    // Otherwise alphanumeric identifier with at least 3 chars
    return /^[a-zA-Z0-9._-]{3,}$/.test(val);
  }, {
    message: "User ID must be a valid email address or alphanumeric username (min 3 chars).",
  }),
  password: z.string().min(6, "Password must be at least 6 characters long."),
  googleEmail: z.string().optional().refine(val => {
    if (!val || val.trim() === "") return true;
    return isValidEmail(val);
  }, {
    message: "Google Mail ID must be a valid email address.",
  }),
});

export type ValidatedTeacherRow = z.infer<typeof TeacherRowSchema>;

