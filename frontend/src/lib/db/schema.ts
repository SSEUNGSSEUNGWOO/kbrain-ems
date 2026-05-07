import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  numeric,
  boolean,
  timestamp,
  time,
  bigint,
  uniqueIndex,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const operators = pgTable(
  "operators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    role: text("role").notNull().default("operator"), // 'developer' | 'operator'
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("operators_name_unique_idx").on(t.name)],
);

export const cohorts = pgTable(
  "cohorts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    startedAt: date("started_at"),
    endedAt: date("ended_at"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("cohorts_name_unique_idx").on(t.name)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("organizations_name_unique_idx").on(t.name)],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey()
      .references(() => applicants.id, { onDelete: "cascade" }),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    department: text("department"),
    jobTitle: text("job_title"),
    jobRole: text("job_role"),
    birthDate: date("birth_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("students_cohort_idx").on(t.cohortId),
    index("students_organization_idx").on(t.organizationId),
  ],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  cohortId: uuid("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "cascade" }),
  sessionDate: date("session_date").notNull(),
  title: text("title"),
  startTime: time("start_time"),
  endTime: time("end_time"),
  breakMinutes: integer("break_minutes").default(0),
  breakStartTime: time("break_start_time"),
  breakEndTime: time("break_end_time"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("absent"),
    note: text("note"),
    arrivalTime: time("arrival_time"),
    departureTime: time("departure_time"),
    creditedHours: numeric("credited_hours", { precision: 4, scale: 1 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("attendance_records_session_student_key").on(
      t.sessionId,
      t.studentId,
    ),
  ],
);

export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  cohortId: uuid("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const applicants = pgTable(
  "applicants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    department: text("department"),
    jobTitle: text("job_title"),
    jobRole: text("job_role"),
    birthDate: date("birth_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("applicants_organization_idx").on(t.organizationId)],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => applicants.id, { onDelete: "cascade" }),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("applied"),
    rejectedStage: text("rejected_stage"),
    appliedAt: date("applied_at"),
    decidedAt: date("decided_at"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("applications_applicant_cohort_key").on(t.applicantId, t.cohortId),
    index("applications_applicant_idx").on(t.applicantId),
    index("applications_cohort_idx").on(t.cohortId),
  ],
);

export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("not_submitted"),
    submittedAt: date("submitted_at"),
    score: numeric("score", { precision: 5, scale: 1 }),
    note: text("note"),
    filePath: text("file_path"),
    fileName: text("file_name"),
    fileSize: bigint("file_size", { mode: "number" }),
    fileType: text("file_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("assignment_submissions_assignment_student_key").on(
      t.assignmentId,
      t.studentId,
    ),
  ],
);
