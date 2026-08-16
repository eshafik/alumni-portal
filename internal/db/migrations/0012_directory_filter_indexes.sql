-- Alumni/student directory filtering by blood group (AlumniHandler.List, StudentHandler.List)
-- had no supporting index — every blood-group-filtered search did a full table scan. batch_id
-- and program_id are already indexed (0001_init.sql); this closes the one gap.
CREATE INDEX idx_alumni_profiles_blood_group ON alumni_profiles(blood_group_id);
CREATE INDEX idx_student_profiles_blood_group ON student_profiles(blood_group_id);
