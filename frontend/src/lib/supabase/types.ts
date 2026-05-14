// 마이그레이션 SQL(supabase/migrations/20260511000000_initial_schema.sql)을 기준으로 작성.
// 향후 스키마가 변경되면 `bunx supabase gen types typescript --project-id ... > types.ts` 로 재생성 가능.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      survey_completions: {
        Row: {
          id: string;
          survey_id: string;
          student_id: string;
          completed_at: string;
        };
        Insert: {
          id?: string;
          survey_id: string;
          student_id: string;
          completed_at?: string;
        };
        Update: {
          id?: string;
          survey_id?: string;
          student_id?: string;
          completed_at?: string;
        };
        Relationships: [];
      };

      operators: {
        Row: {
          id: string;
          name: string;
          role: string;
          title: string | null;
          auth_user_id: string | null;
          cohort_order: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          role?: string;
          title?: string | null;
          auth_user_id?: string | null;
          cohort_order?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: string;
          title?: string | null;
          auth_user_id?: string | null;
          cohort_order?: string[];
          created_at?: string;
        };
        Relationships: [];
      };

      organizations: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      cohorts: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          started_at: string | null;
          ended_at: string | null;
          application_start_at: string | null;
          application_end_at: string | null;
          decided_at: string | null;
          notified_at: string | null;
          delivery_method: string | null;
          orientation_date: string | null;
          recruiting_slug: string | null;
          max_capacity: number | null;
          recruitment_round_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          application_start_at?: string | null;
          application_end_at?: string | null;
          decided_at?: string | null;
          notified_at?: string | null;
          delivery_method?: string | null;
          orientation_date?: string | null;
          recruiting_slug?: string | null;
          max_capacity?: number | null;
          recruitment_round_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          application_start_at?: string | null;
          application_end_at?: string | null;
          decided_at?: string | null;
          notified_at?: string | null;
          delivery_method?: string | null;
          orientation_date?: string | null;
          recruiting_slug?: string | null;
          max_capacity?: number | null;
          recruitment_round_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cohorts_recruitment_round_id_fkey';
            columns: ['recruitment_round_id'];
            referencedRelation: 'recruitment_rounds';
            referencedColumns: ['id'];
          }
        ];
      };

      recruitment_rounds: {
        Row: {
          id: string;
          round_no: number;
          label: string | null;
          application_start_at: string | null;
          application_end_at: string | null;
          selection_at: string | null;
          announce_at: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          round_no: number;
          label?: string | null;
          application_start_at?: string | null;
          application_end_at?: string | null;
          selection_at?: string | null;
          announce_at?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          round_no?: number;
          label?: string | null;
          application_start_at?: string | null;
          application_end_at?: string | null;
          selection_at?: string | null;
          announce_at?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      tracks: {
        Row: {
          id: string;
          cohort_id: string;
          code: string;
          name: string;
          description: string | null;
          min_score: number | null;
          max_score: number | null;
          prereq_required: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          code: string;
          name: string;
          description?: string | null;
          min_score?: number | null;
          max_score?: number | null;
          prereq_required?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          min_score?: number | null;
          max_score?: number | null;
          prereq_required?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tracks_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          }
        ];
      };

      applicants: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          organization_id: string | null;
          department: string | null;
          job_title: string | null;
          job_role: string | null;
          birth_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          organization_id?: string | null;
          department?: string | null;
          job_title?: string | null;
          job_role?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          organization_id?: string | null;
          department?: string | null;
          job_title?: string | null;
          job_role?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'applicants_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          }
        ];
      };

      applications: {
        Row: {
          id: string;
          applicant_id: string;
          cohort_id: string;
          track_id: string | null;
          status: string;
          rejected_stage: string | null;
          applied_at: string | null;
          decided_at: string | null;
          note: string | null;
          /** @deprecated application_answers로 이관 예정 */
          self_diagnosis: Json | null;
          recommended_track_id: string | null;
          motivation: string | null;
          related_work_years: number | null;
          application_file_path: string | null;
          application_file_name: string | null;
          application_file_size: number | null;
          knowledge_score: number | null;
          knowledge_correct_count: number | null;
          knowledge_total_count: number | null;
          self_diagnosis_avg: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          applicant_id: string;
          cohort_id: string;
          track_id?: string | null;
          status?: string;
          rejected_stage?: string | null;
          applied_at?: string | null;
          decided_at?: string | null;
          note?: string | null;
          self_diagnosis?: Json | null;
          recommended_track_id?: string | null;
          motivation?: string | null;
          related_work_years?: number | null;
          application_file_path?: string | null;
          application_file_name?: string | null;
          application_file_size?: number | null;
          knowledge_score?: number | null;
          knowledge_correct_count?: number | null;
          knowledge_total_count?: number | null;
          self_diagnosis_avg?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          applicant_id?: string;
          cohort_id?: string;
          track_id?: string | null;
          status?: string;
          rejected_stage?: string | null;
          applied_at?: string | null;
          decided_at?: string | null;
          note?: string | null;
          self_diagnosis?: Json | null;
          recommended_track_id?: string | null;
          motivation?: string | null;
          related_work_years?: number | null;
          application_file_path?: string | null;
          application_file_name?: string | null;
          application_file_size?: number | null;
          knowledge_score?: number | null;
          knowledge_correct_count?: number | null;
          knowledge_total_count?: number | null;
          self_diagnosis_avg?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'applications_applicant_id_fkey';
            columns: ['applicant_id'];
            referencedRelation: 'applicants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'applications_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'applications_track_id_fkey';
            columns: ['track_id'];
            referencedRelation: 'tracks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'applications_recommended_track_id_fkey';
            columns: ['recommended_track_id'];
            referencedRelation: 'tracks';
            referencedColumns: ['id'];
          }
        ];
      };

      application_questions: {
        Row: {
          id: string;
          cohort_id: string;
          track_id: string | null;
          section: string;
          question_no: string;
          difficulty: string | null;
          question_text: string;
          question_type: string;
          choices: Json | null;
          correct_choice: string | null;
          weight: number;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          track_id?: string | null;
          section: string;
          question_no: string;
          difficulty?: string | null;
          question_text: string;
          question_type: string;
          choices?: Json | null;
          correct_choice?: string | null;
          weight?: number;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          track_id?: string | null;
          section?: string;
          question_no?: string;
          difficulty?: string | null;
          question_text?: string;
          question_type?: string;
          choices?: Json | null;
          correct_choice?: string | null;
          weight?: number;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'application_questions_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'application_questions_track_id_fkey';
            columns: ['track_id'];
            referencedRelation: 'tracks';
            referencedColumns: ['id'];
          }
        ];
      };

      application_answers: {
        Row: {
          id: string;
          application_id: string;
          question_id: string;
          answer_value: Json | null;
          is_correct: boolean | null;
          score: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          question_id: string;
          answer_value?: Json | null;
          is_correct?: boolean | null;
          score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          question_id?: string;
          answer_value?: Json | null;
          is_correct?: boolean | null;
          score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'application_answers_application_id_fkey';
            columns: ['application_id'];
            referencedRelation: 'applications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'application_answers_question_id_fkey';
            columns: ['question_id'];
            referencedRelation: 'application_questions';
            referencedColumns: ['id'];
          }
        ];
      };

      students: {
        Row: {
          id: string;
          cohort_id: string;
          organization_id: string | null;
          name: string;
          email: string | null;
          phone: string | null;
          department: string | null;
          job_title: string | null;
          job_role: string | null;
          birth_date: string | null;
          notes: string | null;
          assigned_track_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          cohort_id: string;
          organization_id?: string | null;
          name: string;
          email?: string | null;
          phone?: string | null;
          department?: string | null;
          job_title?: string | null;
          job_role?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          assigned_track_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          organization_id?: string | null;
          name?: string;
          email?: string | null;
          phone?: string | null;
          department?: string | null;
          job_title?: string | null;
          job_role?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          assigned_track_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'students_id_fkey';
            columns: ['id'];
            referencedRelation: 'applicants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'students_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'students_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'students_assigned_track_id_fkey';
            columns: ['assigned_track_id'];
            referencedRelation: 'tracks';
            referencedColumns: ['id'];
          }
        ];
      };

      sessions: {
        Row: {
          id: string;
          cohort_id: string;
          session_date: string;
          session_end_date: string | null;
          title: string | null;
          start_time: string | null;
          end_time: string | null;
          break_minutes: number | null;
          break_start_time: string | null;
          break_end_time: string | null;
          location_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          session_date: string;
          session_end_date?: string | null;
          title?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          break_minutes?: number | null;
          break_start_time?: string | null;
          break_end_time?: string | null;
          location_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          session_date?: string;
          session_end_date?: string | null;
          title?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          break_minutes?: number | null;
          break_start_time?: string | null;
          break_end_time?: string | null;
          location_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_location_id_fkey';
            columns: ['location_id'];
            referencedRelation: 'locations';
            referencedColumns: ['id'];
          }
        ];
      };

      locations: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      attendance_records: {
        Row: {
          id: string;
          session_id: string;
          student_id: string;
          status: string;
          note: string | null;
          arrival_time: string | null;
          departure_time: string | null;
          credited_hours: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          student_id: string;
          status?: string;
          note?: string | null;
          arrival_time?: string | null;
          departure_time?: string | null;
          credited_hours?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          student_id?: string;
          status?: string;
          note?: string | null;
          arrival_time?: string | null;
          departure_time?: string | null;
          credited_hours?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_records_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_records_student_id_fkey';
            columns: ['student_id'];
            referencedRelation: 'students';
            referencedColumns: ['id'];
          }
        ];
      };

      assignments: {
        Row: {
          id: string;
          cohort_id: string;
          session_id: string | null;
          title: string;
          description: string | null;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          session_id?: string | null;
          title: string;
          description?: string | null;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          session_id?: string | null;
          title?: string;
          description?: string | null;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assignments_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignments_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };

      assignment_submissions: {
        Row: {
          id: string;
          assignment_id: string;
          student_id: string;
          status: string;
          submitted_at: string | null;
          score: string | null;
          note: string | null;
          file_path: string | null;
          file_name: string | null;
          file_size: number | null;
          file_type: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          student_id: string;
          status?: string;
          submitted_at?: string | null;
          score?: string | null;
          note?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assignment_id?: string;
          student_id?: string;
          status?: string;
          submitted_at?: string | null;
          score?: string | null;
          note?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assignment_submissions_assignment_id_fkey';
            columns: ['assignment_id'];
            referencedRelation: 'assignments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'assignment_submissions_student_id_fkey';
            columns: ['student_id'];
            referencedRelation: 'students';
            referencedColumns: ['id'];
          }
        ];
      };

      instructor_grades: {
        Row: {
          id: string;
          code: string;
          name: string;
          hourly_rate: string | null;
          daily_limit_hours: string | null;
          daily_limit_amount: string | null;
          effective_from: string | null;
          effective_to: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          hourly_rate?: string | null;
          daily_limit_hours?: string | null;
          daily_limit_amount?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          hourly_rate?: string | null;
          daily_limit_hours?: string | null;
          daily_limit_amount?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      instructors: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          affiliation: string | null;
          specialty: string | null;
          grade_id: string | null;
          kind: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          affiliation?: string | null;
          specialty?: string | null;
          grade_id?: string | null;
          kind?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          affiliation?: string | null;
          specialty?: string | null;
          grade_id?: string | null;
          kind?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'instructors_grade_id_fkey';
            columns: ['grade_id'];
            referencedRelation: 'instructor_grades';
            referencedColumns: ['id'];
          }
        ];
      };

      session_instructors: {
        Row: {
          id: string;
          session_id: string;
          instructor_id: string;
          role: string;
          hours: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          instructor_id: string;
          role?: string;
          hours?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          instructor_id?: string;
          role?: string;
          hours?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_instructors_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_instructors_instructor_id_fkey';
            columns: ['instructor_id'];
            referencedRelation: 'instructors';
            referencedColumns: ['id'];
          }
        ];
      };

      session_operators: {
        Row: {
          id: string;
          session_id: string;
          operator_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          operator_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          operator_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_operators_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_operators_operator_id_fkey';
            columns: ['operator_id'];
            referencedRelation: 'operators';
            referencedColumns: ['id'];
          }
        ];
      };

      instructor_fees: {
        Row: {
          id: string;
          session_instructor_id: string;
          hourly_rate: string | null;
          hours: string | null;
          calculated_amount: string | null;
          approved_amount: string | null;
          status: string;
          approved_at: string | null;
          approved_by: string | null;
          paid_at: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_instructor_id: string;
          hourly_rate?: string | null;
          hours?: string | null;
          calculated_amount?: string | null;
          approved_amount?: string | null;
          status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          paid_at?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_instructor_id?: string;
          hourly_rate?: string | null;
          hours?: string | null;
          calculated_amount?: string | null;
          approved_amount?: string | null;
          status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          paid_at?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'instructor_fees_session_instructor_id_fkey';
            columns: ['session_instructor_id'];
            referencedRelation: 'session_instructors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'instructor_fees_approved_by_fkey';
            columns: ['approved_by'];
            referencedRelation: 'operators';
            referencedColumns: ['id'];
          }
        ];
      };

      surveys: {
        Row: {
          id: string;
          cohort_id: string;
          session_id: string | null;
          title: string;
          type: string;
          scope: string | null;
          share_code: string | null;
          opens_at: string | null;
          closes_at: string | null;
          respondent_total: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          session_id?: string | null;
          title: string;
          type: string;
          scope?: string | null;
          share_code?: string | null;
          opens_at?: string | null;
          closes_at?: string | null;
          respondent_total?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          session_id?: string | null;
          title?: string;
          type?: string;
          scope?: string | null;
          share_code?: string | null;
          opens_at?: string | null;
          closes_at?: string | null;
          respondent_total?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'surveys_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'surveys_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };

      survey_questions: {
        Row: {
          id: string;
          survey_id: string;
          question_no: number;
          type: string;
          text: string;
          options: Json | null;
          required: boolean;
          section_no: number | null;
          section_title: string | null;
          instructor_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          survey_id: string;
          question_no: number;
          type: string;
          text: string;
          options?: Json | null;
          required?: boolean;
          section_no?: number | null;
          section_title?: string | null;
          instructor_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          survey_id?: string;
          question_no?: number;
          type?: string;
          text?: string;
          options?: Json | null;
          required?: boolean;
          section_no?: number | null;
          section_title?: string | null;
          instructor_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'survey_questions_survey_id_fkey';
            columns: ['survey_id'];
            referencedRelation: 'surveys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_questions_instructor_id_fkey';
            columns: ['instructor_id'];
            referencedRelation: 'instructors';
            referencedColumns: ['id'];
          }
        ];
      };

      survey_responses: {
        Row: {
          id: string;
          survey_id: string;
          student_id: string | null;
          responses: Json | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          survey_id: string;
          student_id?: string | null;
          responses?: Json | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          survey_id?: string;
          student_id?: string | null;
          responses?: Json | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'survey_responses_survey_id_fkey';
            columns: ['survey_id'];
            referencedRelation: 'surveys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'survey_responses_student_id_fkey';
            columns: ['student_id'];
            referencedRelation: 'students';
            referencedColumns: ['id'];
          }
        ];
      };

      diagnoses: {
        Row: {
          id: string;
          cohort_id: string;
          title: string;
          type: string;
          opens_at: string | null;
          closes_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          title: string;
          type: string;
          opens_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          title?: string;
          type?: string;
          opens_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'diagnoses_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          }
        ];
      };

      diagnosis_questions: {
        Row: {
          id: string;
          diagnosis_id: string;
          question_no: number;
          type: string;
          text: string;
          options: Json | null;
          weight: string | null;
          required: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          diagnosis_id: string;
          question_no: number;
          type: string;
          text: string;
          options?: Json | null;
          weight?: string | null;
          required?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          diagnosis_id?: string;
          question_no?: number;
          type?: string;
          text?: string;
          options?: Json | null;
          weight?: string | null;
          required?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'diagnosis_questions_diagnosis_id_fkey';
            columns: ['diagnosis_id'];
            referencedRelation: 'diagnoses';
            referencedColumns: ['id'];
          }
        ];
      };

      diagnosis_responses: {
        Row: {
          id: string;
          diagnosis_id: string;
          student_id: string | null;
          token: string;
          responses: Json | null;
          total_score: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          diagnosis_id: string;
          student_id?: string | null;
          token: string;
          responses?: Json | null;
          total_score?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          diagnosis_id?: string;
          student_id?: string | null;
          token?: string;
          responses?: Json | null;
          total_score?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'diagnosis_responses_diagnosis_id_fkey';
            columns: ['diagnosis_id'];
            referencedRelation: 'diagnoses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'diagnosis_responses_student_id_fkey';
            columns: ['student_id'];
            referencedRelation: 'students';
            referencedColumns: ['id'];
          }
        ];
      };

      evaluators: {
        Row: {
          id: string;
          cohort_id: string;
          name: string;
          anonymous_code: string | null;
          affiliation: string | null;
          email: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          name: string;
          anonymous_code?: string | null;
          affiliation?: string | null;
          email?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          name?: string;
          anonymous_code?: string | null;
          affiliation?: string | null;
          email?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluators_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          }
        ];
      };

      evaluations: {
        Row: {
          id: string;
          evaluator_id: string;
          application_id: string;
          score: string | null;
          scores: Json | null;
          comments: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          evaluator_id: string;
          application_id: string;
          score?: string | null;
          scores?: Json | null;
          comments?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          evaluator_id?: string;
          application_id?: string;
          score?: string | null;
          scores?: Json | null;
          comments?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluations_evaluator_id_fkey';
            columns: ['evaluator_id'];
            referencedRelation: 'evaluators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'evaluations_application_id_fkey';
            columns: ['application_id'];
            referencedRelation: 'applications';
            referencedColumns: ['id'];
          }
        ];
      };

      cohort_reports: {
        Row: {
          id: string;
          cohort_id: string;
          session_id: string | null;
          type: string;
          title: string | null;
          content: Json | null;
          status: string;
          file_path: string | null;
          draft_at: string | null;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          session_id?: string | null;
          type: string;
          title?: string | null;
          content?: Json | null;
          status?: string;
          file_path?: string | null;
          draft_at?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          session_id?: string | null;
          type?: string;
          title?: string | null;
          content?: Json | null;
          status?: string;
          file_path?: string | null;
          draft_at?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cohort_reports_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cohort_reports_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          }
        ];
      };

      notifications: {
        Row: {
          id: string;
          cohort_id: string | null;
          recipient_type: string;
          recipient_id: string | null;
          channel: string;
          channels: string[] | null;
          template_code: string | null;
          subject: string | null;
          body: string | null;
          status: string;
          scheduled_at: string | null;
          sent_at: string | null;
          sent_by_operator_id: string | null;
          error_message: string | null;
          external_message_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id?: string | null;
          recipient_type: string;
          recipient_id?: string | null;
          channel: string;
          channels?: string[] | null;
          template_code?: string | null;
          subject?: string | null;
          body?: string | null;
          status?: string;
          scheduled_at?: string | null;
          sent_at?: string | null;
          sent_by_operator_id?: string | null;
          error_message?: string | null;
          external_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string | null;
          recipient_type?: string;
          recipient_id?: string | null;
          channel?: string;
          channels?: string[] | null;
          template_code?: string | null;
          subject?: string | null;
          body?: string | null;
          status?: string;
          scheduled_at?: string | null;
          sent_at?: string | null;
          sent_by_operator_id?: string | null;
          error_message?: string | null;
          external_message_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_sent_by_operator_id_fkey';
            columns: ['sent_by_operator_id'];
            referencedRelation: 'operators';
            referencedColumns: ['id'];
          }
        ];
      };

      cohort_dispatch_config: {
        Row: {
          id: string;
          cohort_id: string;
          template_code: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cohort_id: string;
          template_code: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cohort_id?: string;
          template_code?: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cohort_dispatch_config_cohort_id_fkey';
            columns: ['cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          }
        ];
      };

      risks: {
        Row: {
          id: string;
          title: string;
          category: string | null;
          description: string | null;
          likelihood: string | null;
          impact: string | null;
          mitigation: string | null;
          status: string;
          owner_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category?: string | null;
          description?: string | null;
          likelihood?: string | null;
          impact?: string | null;
          mitigation?: string | null;
          status?: string;
          owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          category?: string | null;
          description?: string | null;
          likelihood?: string | null;
          impact?: string | null;
          mitigation?: string | null;
          status?: string;
          owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'risks_owner_id_fkey';
            columns: ['owner_id'];
            referencedRelation: 'operators';
            referencedColumns: ['id'];
          }
        ];
      };

      issues: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: string;
          priority: string | null;
          related_cohort_id: string | null;
          owner_id: string | null;
          reported_at: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          status?: string;
          priority?: string | null;
          related_cohort_id?: string | null;
          owner_id?: string | null;
          reported_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          status?: string;
          priority?: string | null;
          related_cohort_id?: string | null;
          owner_id?: string | null;
          reported_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'issues_related_cohort_id_fkey';
            columns: ['related_cohort_id'];
            referencedRelation: 'cohorts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'issues_owner_id_fkey';
            columns: ['owner_id'];
            referencedRelation: 'operators';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Convenience exports for individual rows
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
