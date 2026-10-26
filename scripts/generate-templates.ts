import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const templatesDir = path.join(process.cwd(), "public", "templates");
if (!fs.existsSync(templatesDir)) {
  fs.mkdirSync(templatesDir, { recursive: true });
}

// 1. Student-Parent Templates
const studentHeaders = [
  "studentFirstName", "studentLastName", "studentRollNo", "admissionNo", 
  "studentDob", "class", "residenceType", 
  "parentFirstName", "parentLastName", "parentEmail", "parentPassword", "parentPhone", "parentAddress"
];
const studentSample = [
  "Arun", "Kumar", "2025CS101", "ADM-2025-001",
  "2010-05-15", "Class 10 - A", "DAYSCHOLAR",
  "Ramesh", "Kumar", "ramesh.parent@example.com", "Parent@123", "9876543210", "123 Park Street, City"
];

const studentCsvContent = [
  studentHeaders.join(","),
  studentSample.join(",")
].join("\n");
fs.writeFileSync(path.join(templatesDir, "student_upload_template.csv"), studentCsvContent, "utf8");

const studentWs = XLSX.utils.aoa_to_sheet([studentHeaders, studentSample]);
const studentWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(studentWb, studentWs, "Students");
XLSX.writeFile(studentWb, path.join(templatesDir, "student_upload_template.xlsx"));

// 2. Teacher Templates
const teacherHeaders = [
  "firstName", "lastName", "email", "password", "phone", "joiningDate", "qualification", "subjects"
];
const teacherSample = [
  "Rajesh", "Sharma", "r.sharma@school.internal", "Teacher@123", "9876543211", "2024-06-01", "M.Sc B.Ed", "Science"
];

const teacherCsvContent = [
  teacherHeaders.join(","),
  teacherSample.join(",")
].join("\n");
fs.writeFileSync(path.join(templatesDir, "teacher_upload_template.csv"), teacherCsvContent, "utf8");

const teacherWs = XLSX.utils.aoa_to_sheet([teacherHeaders, teacherSample]);
const teacherWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(teacherWb, teacherWs, "Teachers");
XLSX.writeFile(teacherWb, path.join(templatesDir, "teacher_upload_template.xlsx"));

// 3. Admin Templates
const adminHeaders = ["name", "email"];
const adminSample = ["System Administrator", "admin.example@gmail.com"];

const adminCsvContent = [
  adminHeaders.join(","),
  adminSample.join(",")
].join("\n");
fs.writeFileSync(path.join(templatesDir, "admin_upload_template.csv"), adminCsvContent, "utf8");

const adminWs = XLSX.utils.aoa_to_sheet([adminHeaders, adminSample]);
const adminWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(adminWb, adminWs, "Admins");
XLSX.writeFile(adminWb, path.join(templatesDir, "admin_upload_template.xlsx"));

// 4. Subject Templates
const subjectHeaders = ["name", "code", "maxMarks", "passMarks", "class", "teacherEmail"];
const subjectSample = ["Physics", "PHY", "100", "35", "Class 4 - Section A", "r.sharma@school.internal"];

const subjectCsvContent = [
  subjectHeaders.join(","),
  subjectSample.join(",")
].join("\n");
fs.writeFileSync(path.join(templatesDir, "subject_upload_template.csv"), subjectCsvContent, "utf8");

const subjectWs = XLSX.utils.aoa_to_sheet([subjectHeaders, subjectSample]);
const subjectWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(subjectWb, subjectWs, "Subjects");
XLSX.writeFile(subjectWb, path.join(templatesDir, "subject_upload_template.xlsx"));

console.log("All templates successfully generated in public/templates!");
