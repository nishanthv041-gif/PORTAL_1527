-- ==============================================================================
-- SRT UNIVERSAL SCHOOL PORTAL - DATABASE PERFORMANCE INDEXES
-- Purpose: Optimize PostgreSQL query execution speed on Neon / Supabase
-- Target: Foreign keys, status filters, compound search, and sorting columns
-- ==============================================================================

-- 1. Student Table Indexes
CREATE INDEX IF NOT EXISTS "idx_student_class_active" 
  ON "Student" ("classId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_student_admission_no" 
  ON "Student" ("admissionNo");

CREATE INDEX IF NOT EXISTS "idx_student_enrollment_status" 
  ON "Student" ("enrollmentStatus");

-- 2. Attendance Table Indexes
CREATE INDEX IF NOT EXISTS "idx_attendance_student_date" 
  ON "Attendance" ("studentId", "date");

CREATE INDEX IF NOT EXISTS "idx_attendance_class_date" 
  ON "Attendance" ("classId", "date");

CREATE INDEX IF NOT EXISTS "idx_attendance_student_status" 
  ON "Attendance" ("studentId", "status");

CREATE INDEX IF NOT EXISTS "idx_attendance_date_status" 
  ON "Attendance" ("date", "status");

-- 3. Mark / Exam Table Indexes
CREATE INDEX IF NOT EXISTS "idx_mark_student_exam_subject" 
  ON "Mark" ("studentId", "examId", "subjectId");

CREATE INDEX IF NOT EXISTS "idx_mark_exam_subject" 
  ON "Mark" ("examId", "subjectId");

CREATE INDEX IF NOT EXISTS "idx_mark_entered_by_staff" 
  ON "Mark" ("enteredByStaffId");

-- 4. Parent-Student Relationship Indexes
CREATE INDEX IF NOT EXISTS "idx_parent_student_composite" 
  ON "ParentStudent" ("parentId", "studentId");

CREATE INDEX IF NOT EXISTS "idx_parent_student_student" 
  ON "ParentStudent" ("studentId");

-- 5. Class & Teacher Assignment Indexes
CREATE INDEX IF NOT EXISTS "idx_class_teacher_active" 
  ON "Class" ("teacherId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_class_teacher_in_charge" 
  ON "Class" ("classTeacherId", "isActive");

-- 6. Teacher & Staff Attendance Indexes
CREATE INDEX IF NOT EXISTS "idx_teacher_attendance_date" 
  ON "TeacherAttendance" ("teacherId", "date");

CREATE INDEX IF NOT EXISTS "idx_teacher_attendance_status" 
  ON "TeacherAttendance" ("date", "status");

CREATE INDEX IF NOT EXISTS "idx_staff_attendance_date" 
  ON "StaffAttendance" ("staffId", "date");

CREATE INDEX IF NOT EXISTS "idx_staff_attendance_status" 
  ON "StaffAttendance" ("date", "status");

-- 7. Notification Table Indexes
CREATE INDEX IF NOT EXISTS "idx_notification_recipient_read_created" 
  ON "Notification" ("userId", "isRead", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_notification_user_created" 
  ON "Notification" ("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_notification_user_read_created" 
  ON "Notification" ("userId", "isRead", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_notification_recipient_user_read" 
  ON "NotificationRecipient" ("userId", "read");

-- 8. Message Table Indexes
CREATE INDEX IF NOT EXISTS "idx_message_sender_receiver_created" 
  ON "Message" ("senderId", "receiverId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_message_receiver_unread" 
  ON "Message" ("receiverId", "isRead");

-- 9. UserSession Table Indexes for High-Speed Authentication and Single-Device Lookups
CREATE INDEX IF NOT EXISTS "idx_user_session_session_revoked" 
  ON "UserSession" ("sessionId", "revokedAt");

CREATE INDEX IF NOT EXISTS "idx_user_session_user_revoked" 
  ON "UserSession" ("userId", "revokedAt");

-- 10. System Entity Indexes for Fast Clear & Delete Mutations
CREATE INDEX IF NOT EXISTS "idx_announcement_created" 
  ON "Announcement" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_event_date" 
  ON "Event" ("date");

CREATE INDEX IF NOT EXISTS "idx_discipline_student_created" 
  ON "DisciplineRecord" ("studentId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_complaint_status_created" 
  ON "Complaint" ("status", "createdAt" DESC);
