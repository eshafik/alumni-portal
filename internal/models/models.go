package models

// Role IDs (seeded in migration 0001)
const (
	RoleSuperAdmin = 1
	RoleAdmin      = 2
	RoleModerator  = 3
	RoleAlumni     = 4
	RoleStudent    = 5
)

const (
	StatusPendingVerification = "pending_verification"
	StatusPendingApproval     = "pending_approval"
	StatusApproved            = "approved"
	StatusRejected            = "rejected"
	StatusSuspended           = "suspended"
)

type Institution struct {
	ID                  int64  `db:"id" json:"id"`
	Name                string `db:"name" json:"name"`
	ShortName           string `db:"short_name" json:"shortName"`
	Slug                string `db:"slug" json:"slug"`
	InstitutionType     string `db:"institution_type" json:"institutionType"`
	Description         string `db:"description" json:"description"`
	Tagline             string `db:"tagline" json:"tagline"`
	Address             string `db:"address" json:"address"`
	Website             string `db:"website" json:"website"`
	ContactEmail        string `db:"contact_email" json:"contactEmail"`
	AboutText           string `db:"about_text" json:"aboutText"`
	MissionText         string `db:"mission_text" json:"missionText"`
	LogoAttachmentID    *int64 `db:"logo_attachment_id" json:"logoAttachmentId,omitempty"`
	FaviconAttachmentID *int64 `db:"favicon_attachment_id" json:"faviconAttachmentId,omitempty"`
	ThemeColor          string `db:"theme_color" json:"themeColor"`
	SocialLinks         string `db:"social_links" json:"socialLinks"`
	CreatedAt           string `db:"created_at" json:"createdAt"`
	UpdatedAt           string `db:"updated_at" json:"updatedAt"`
}

type HomeGalleryImage struct {
	ID            int64  `db:"id" json:"id"`
	InstitutionID int64  `db:"institution_id" json:"institutionId"`
	AttachmentID  int64  `db:"attachment_id" json:"attachmentId"`
	Caption       string `db:"caption" json:"caption"`
	SortOrder     int    `db:"sort_order" json:"sortOrder"`
	IsActive      bool   `db:"is_active" json:"isActive"`
	CreatedAt     string `db:"created_at" json:"createdAt"`
}

type User struct {
	ID                         int64   `db:"id" json:"id"`
	InstitutionID              int64   `db:"institution_id" json:"institutionId"`
	RoleID                     int64   `db:"role_id" json:"roleId"`
	FullName                   string  `db:"full_name" json:"fullName"`
	Email                      string  `db:"email" json:"email"`
	Phone                      string  `db:"phone" json:"phone"`
	PasswordHash               string  `db:"password_hash" json:"-"`
	Status                     string  `db:"status" json:"status"`
	ModeratorScopeDepartmentID *int64  `db:"moderator_scope_department_id" json:"moderatorScopeDepartmentId,omitempty"`
	ModeratorScopeBatchID      *int64  `db:"moderator_scope_batch_id" json:"moderatorScopeBatchId,omitempty"`
	RejectionReason            string  `db:"rejection_reason" json:"rejectionReason,omitempty"`
	CreatedAt                  string  `db:"created_at" json:"createdAt"`
	UpdatedAt                  string  `db:"updated_at" json:"updatedAt"`
	LastLoginAt                *string `db:"last_login_at" json:"lastLoginAt,omitempty"`
	AvatarAttachmentID         *int64  `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	Bio                        string  `db:"bio" json:"bio"`
	CurrentLocation            string  `db:"current_location" json:"currentLocation"`
	BloodGroupID               *int64  `db:"blood_group_id" json:"bloodGroupId,omitempty"`
	CurrentDesignation         string  `db:"current_designation" json:"currentDesignation"`
	PrivacyEmail               bool    `db:"privacy_email" json:"privacyEmail"`
	PrivacyPhone               bool    `db:"privacy_phone" json:"privacyPhone"`
	PrivacyLocation            bool    `db:"privacy_location" json:"privacyLocation"`
	CurrentCompanyName         string  `db:"current_company_name" json:"currentCompanyName"`
	LinkedinURL                string  `db:"linkedin_url" json:"linkedinUrl"`
	WhatsappNumber             string  `db:"whatsapp_number" json:"whatsappNumber"`
	WebsiteURL                 string  `db:"website_url" json:"websiteUrl"`
	PrivacyWhatsapp            bool    `db:"privacy_whatsapp" json:"privacyWhatsapp"`
	PrivacyCompany             bool    `db:"privacy_company" json:"privacyCompany"`
	StudentID                  string  `db:"student_id" json:"studentId"`
	PassingYear                *int64  `db:"passing_year" json:"passingYear,omitempty"`
}

type Department struct {
	ID            int64  `db:"id" json:"id"`
	InstitutionID int64  `db:"institution_id" json:"institutionId"`
	Name          string `db:"name" json:"name"`
	Code          string `db:"code" json:"code"`
	IsActive      bool   `db:"is_active" json:"isActive"`
	CreatedAt     string `db:"created_at" json:"createdAt"`
}

type Program struct {
	ID           int64  `db:"id" json:"id"`
	DepartmentID int64  `db:"department_id" json:"departmentId"`
	Name         string `db:"name" json:"name"`
	DegreeLevel  string `db:"degree_level" json:"degreeLevel"`
	IsActive     bool   `db:"is_active" json:"isActive"`
	CreatedAt    string `db:"created_at" json:"createdAt"`
}

type BloodGroup struct {
	ID            int64  `db:"id" json:"id"`
	InstitutionID int64  `db:"institution_id" json:"institutionId"`
	Name          string `db:"name" json:"name"`
	IsActive      bool   `db:"is_active" json:"isActive"`
	SortOrder     int    `db:"sort_order" json:"sortOrder"`
}

type Batch struct {
	ID        int64  `db:"id" json:"id"`
	ProgramID int64  `db:"program_id" json:"programId"`
	StartYear *int   `db:"start_year" json:"startYear,omitempty"`
	EndYear   *int   `db:"end_year" json:"endYear,omitempty"`
	Label     string `db:"label" json:"label"`
	IsActive  bool   `db:"is_active" json:"isActive"`
	SortOrder int    `db:"sort_order" json:"sortOrder"`
	CreatedAt string `db:"created_at" json:"createdAt"`
}

type StudentProfile struct {
	ID                 int64  `db:"id" json:"id"`
	UserID             int64  `db:"user_id" json:"userId"`
	ProgramID          int64  `db:"program_id" json:"programId"`
	BatchID            int64  `db:"batch_id" json:"batchId"`
	RollNumber         string `db:"roll_number" json:"rollNumber"`
	Status             string `db:"status" json:"status"`
	BloodGroupID       *int64 `db:"blood_group_id" json:"bloodGroupId,omitempty"`
	CurrentLocation    string `db:"current_location" json:"currentLocation"`
	AvatarAttachmentID *int64 `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	CreatedAt          string `db:"created_at" json:"createdAt"`
	UpdatedAt          string `db:"updated_at" json:"updatedAt"`
}

type AlumniProfile struct {
	ID                 int64  `db:"id" json:"id"`
	UserID             int64  `db:"user_id" json:"userId"`
	ProgramID          int64  `db:"program_id" json:"programId"`
	BatchID            int64  `db:"batch_id" json:"batchId"`
	GraduationYear     *int   `db:"graduation_year" json:"graduationYear,omitempty"`
	BloodGroupID       *int64 `db:"blood_group_id" json:"bloodGroupId,omitempty"`
	CurrentLocation    string `db:"current_location" json:"currentLocation"`
	CurrentDesignation string `db:"current_designation" json:"currentDesignation"`
	Bio                string `db:"bio" json:"bio"`
	AvatarAttachmentID *int64 `db:"avatar_attachment_id" json:"avatarAttachmentId,omitempty"`
	LinkedinURL        string `db:"linkedin_url" json:"linkedinUrl"`
	WhatsappNumber     string `db:"whatsapp_number" json:"whatsappNumber"`
	WebsiteURL         string `db:"website_url" json:"websiteUrl"`
	PrivacyEmail       bool   `db:"privacy_email" json:"privacyEmail"`
	PrivacyPhone       bool   `db:"privacy_phone" json:"privacyPhone"`
	PrivacyWhatsapp    bool   `db:"privacy_whatsapp" json:"privacyWhatsapp"`
	PrivacyLocation    bool   `db:"privacy_location" json:"privacyLocation"`
	PrivacyCompany     bool   `db:"privacy_company" json:"privacyCompany"`
	CreatedAt          string `db:"created_at" json:"createdAt"`
	UpdatedAt          string `db:"updated_at" json:"updatedAt"`
}

type Company struct {
	ID       int64  `db:"id" json:"id"`
	Name     string `db:"name" json:"name"`
	Industry string `db:"industry" json:"industry"`
}

type EmploymentHistory struct {
	ID              int64   `db:"id" json:"id"`
	AlumniProfileID int64   `db:"alumni_profile_id" json:"alumniProfileId"`
	CompanyID       int64   `db:"company_id" json:"companyId"`
	Title           string  `db:"title" json:"title"`
	StartDate       *string `db:"start_date" json:"startDate,omitempty"`
	EndDate         *string `db:"end_date" json:"endDate,omitempty"`
	IsCurrent       bool    `db:"is_current" json:"isCurrent"`
}

type Committee struct {
	ID            int64  `db:"id" json:"id"`
	InstitutionID int64  `db:"institution_id" json:"institutionId"`
	TermStart     int    `db:"term_start" json:"termStart"`
	TermEnd       int    `db:"term_end" json:"termEnd"`
	IsCurrent     bool   `db:"is_current" json:"isCurrent"`
	CreatedAt     string `db:"created_at" json:"createdAt"`
}

type CommitteePosition struct {
	ID             int64  `db:"id" json:"id"`
	CommitteeID    int64  `db:"committee_id" json:"committeeId"`
	Title          string `db:"title" json:"title"`
	IsDefaultAdmin bool   `db:"is_default_admin" json:"isDefaultAdmin"`
	IsActive       bool   `db:"is_active" json:"isActive"`
	SortOrder      int    `db:"sort_order" json:"sortOrder"`
}

type CommitteeMember struct {
	ID                  int64  `db:"id" json:"id"`
	CommitteePositionID int64  `db:"committee_position_id" json:"committeePositionId"`
	UserID              int64  `db:"user_id" json:"userId"`
	AppointedAt         string `db:"appointed_at" json:"appointedAt"`
}

type Post struct {
	ID            int64  `db:"id" json:"id"`
	InstitutionID int64  `db:"institution_id" json:"institutionId"`
	AuthorUserID  int64  `db:"author_user_id" json:"authorUserId"`
	Title         string `db:"title" json:"title"`
	Body          string `db:"body" json:"body"`
	Status        string `db:"status" json:"status"`
	CreatedAt     string `db:"created_at" json:"createdAt"`
	UpdatedAt     string `db:"updated_at" json:"updatedAt"`
}

type JobPost struct {
	ID                int64   `db:"id" json:"id"`
	InstitutionID     int64   `db:"institution_id" json:"institutionId"`
	PostedByUserID    int64   `db:"posted_by_user_id" json:"postedByUserId"`
	Title             string  `db:"title" json:"title"`
	CompanyName       string  `db:"company_name" json:"companyName"`
	Location          string  `db:"location" json:"location"`
	EmploymentType    string  `db:"employment_type" json:"employmentType"`
	Description       string  `db:"description" json:"description"`
	Salary            string  `db:"salary" json:"salary"`
	ApplyURL          string  `db:"apply_url" json:"applyUrl"`
	ApplyEmail        string  `db:"apply_email" json:"applyEmail"`
	ImageAttachmentID *int64  `db:"image_attachment_id" json:"imageAttachmentId,omitempty"`
	Deadline          *string `db:"deadline" json:"deadline,omitempty"`
	Status            string  `db:"status" json:"status"`
	CreatedAt         string  `db:"created_at" json:"createdAt"`
	UpdatedAt         string  `db:"updated_at" json:"updatedAt"`
}

type Notice struct {
	ID                int64  `db:"id" json:"id"`
	InstitutionID     int64  `db:"institution_id" json:"institutionId"`
	AuthorUserID      int64  `db:"author_user_id" json:"authorUserId"`
	Title             string `db:"title" json:"title"`
	Body              string `db:"body" json:"body"`
	Importance        string `db:"importance" json:"importance"`
	Pinned            bool   `db:"pinned" json:"pinned"`
	IsPublic          bool   `db:"is_public" json:"isPublic"`
	ImageAttachmentID *int64 `db:"image_attachment_id" json:"imageAttachmentId,omitempty"`
	PublishedAt       string `db:"published_at" json:"publishedAt"`
	CreatedAt         string `db:"created_at" json:"createdAt"`
}

type Event struct {
	ID                   int64   `db:"id" json:"id"`
	InstitutionID        int64   `db:"institution_id" json:"institutionId"`
	Slug                 string  `db:"slug" json:"slug"`
	Title                string  `db:"title" json:"title"`
	Description          string  `db:"description" json:"description"`
	CoverAttachmentID    *int64  `db:"cover_attachment_id" json:"coverAttachmentId,omitempty"`
	StartAt              string  `db:"start_at" json:"startAt"`
	EndAt                *string `db:"end_at" json:"endAt,omitempty"`
	Venue                string  `db:"venue" json:"venue"`
	OnlineURL            string  `db:"online_url" json:"onlineUrl"`
	RegistrationDeadline *string `db:"registration_deadline" json:"registrationDeadline,omitempty"`
	Capacity             *int    `db:"capacity" json:"capacity,omitempty"`
	Status               string  `db:"status" json:"status"`
	IsPublic             bool    `db:"is_public" json:"isPublic"`
	RegistrationURL      *string `db:"registration_url" json:"registrationUrl,omitempty"`
	ResponseURL          *string `db:"response_url" json:"-"`
	CreatedByUserID      int64   `db:"created_by_user_id" json:"createdByUserId"`
	CreatedAt            string  `db:"created_at" json:"createdAt"`
	UpdatedAt            string  `db:"updated_at" json:"updatedAt"`
}

type EventRegistration struct {
	ID           int64  `db:"id" json:"id"`
	EventID      int64  `db:"event_id" json:"eventId"`
	UserID       int64  `db:"user_id" json:"userId"`
	Status       string `db:"status" json:"status"`
	RegisteredAt string `db:"registered_at" json:"registeredAt"`
}

type Business struct {
	ID               int64  `db:"id" json:"id"`
	InstitutionID    int64  `db:"institution_id" json:"institutionId"`
	OwnerUserID      int64  `db:"owner_user_id" json:"ownerUserId"`
	Name             string `db:"name" json:"name"`
	Category         string `db:"category" json:"category"`
	Description      string `db:"description" json:"description"`
	Location         string `db:"location" json:"location"`
	Website          string `db:"website" json:"website"`
	ContactPhone     string `db:"contact_phone" json:"contactPhone"`
	ContactEmail     string `db:"contact_email" json:"contactEmail"`
	LogoAttachmentID *int64 `db:"logo_attachment_id" json:"logoAttachmentId,omitempty"`
	SocialLinks      string `db:"social_links" json:"socialLinks"`
	Status           string `db:"status" json:"status"`
	CreatedAt        string `db:"created_at" json:"createdAt"`
}

type Notification struct {
	ID                int64   `db:"id" json:"id"`
	UserID            int64   `db:"user_id" json:"userId"`
	Type              string  `db:"type" json:"type"`
	Title             string  `db:"title" json:"title"`
	Body              string  `db:"body" json:"body"`
	RelatedEntityType string  `db:"related_entity_type" json:"relatedEntityType,omitempty"`
	RelatedEntityID   *int64  `db:"related_entity_id" json:"relatedEntityId,omitempty"`
	ReadAt            *string `db:"read_at" json:"readAt,omitempty"`
	CreatedAt         string  `db:"created_at" json:"createdAt"`
}

type OTP struct {
	ID         int64   `db:"id" json:"id"`
	Email      string  `db:"email" json:"email"`
	CodeHash   string  `db:"code_hash" json:"-"`
	Purpose    string  `db:"purpose" json:"purpose"`
	Attempts   int     `db:"attempts" json:"attempts"`
	ConsumedAt *string `db:"consumed_at" json:"consumedAt,omitempty"`
	ExpiresAt  string  `db:"expires_at" json:"expiresAt"`
	CreatedAt  string  `db:"created_at" json:"createdAt"`
}

type AuditLog struct {
	ID            int64  `db:"id" json:"id"`
	InstitutionID int64  `db:"institution_id" json:"institutionId"`
	ActorUserID   *int64 `db:"actor_user_id" json:"actorUserId,omitempty"`
	Action        string `db:"action" json:"action"`
	EntityType    string `db:"entity_type" json:"entityType"`
	EntityID      *int64 `db:"entity_id" json:"entityId,omitempty"`
	BeforeJSON    string `db:"before_json" json:"beforeJson"`
	AfterJSON     string `db:"after_json" json:"afterJson"`
	CreatedAt     string `db:"created_at" json:"createdAt"`
}

type Attachment struct {
	ID               int64  `db:"id" json:"id"`
	InstitutionID    int64  `db:"institution_id" json:"institutionId"`
	StorageKey       string `db:"storage_key" json:"storageKey"`
	OriginalFilename string `db:"original_filename" json:"originalFilename"`
	MimeType         string `db:"mime_type" json:"mimeType"`
	SizeBytes        int64  `db:"size_bytes" json:"sizeBytes"`
	UploadedByUserID *int64 `db:"uploaded_by_user_id" json:"uploadedByUserId,omitempty"`
	CreatedAt        string `db:"created_at" json:"createdAt"`
}

type EmailOutboxItem struct {
	ID        int64   `db:"id" json:"id"`
	ToEmail   string  `db:"to_email" json:"toEmail"`
	Subject   string  `db:"subject" json:"subject"`
	BodyHTML  string  `db:"body_html" json:"bodyHtml"`
	Status    string  `db:"status" json:"status"`
	Attempts  int     `db:"attempts" json:"attempts"`
	LastError string  `db:"last_error" json:"lastError"`
	CreatedAt string  `db:"created_at" json:"createdAt"`
	SentAt    *string `db:"sent_at" json:"sentAt,omitempty"`
}

type OutreachCampaign struct {
	ID              int64   `db:"id" json:"id"`
	Channel         string  `db:"channel" json:"channel"`
	Subject         string  `db:"subject" json:"subject"`
	Message         string  `db:"message" json:"message"`
	TargetAlumni    bool    `db:"target_alumni" json:"targetAlumni"`
	TargetStudents  bool    `db:"target_students" json:"targetStudents"`
	FiltersJSON     string  `db:"filters_json" json:"filtersJson"`
	SMSSegments     int     `db:"sms_segments" json:"smsSegments"`
	RecipientCount  int     `db:"recipient_count" json:"recipientCount"`
	EstimatedCost   float64 `db:"estimated_cost" json:"estimatedCost"`
	Currency        string  `db:"currency" json:"currency"`
	Status          string  `db:"status" json:"status"`
	SuccessCount    int     `db:"success_count" json:"successCount"`
	FailedCount     int     `db:"failed_count" json:"failedCount"`
	CreatedByUserID *int64  `db:"created_by_user_id" json:"createdByUserId,omitempty"`
	CreatedAt       string  `db:"created_at" json:"createdAt"`
	CompletedAt     *string `db:"completed_at" json:"completedAt,omitempty"`
}

type OutreachRecipient struct {
	ID             int64   `db:"id" json:"id"`
	CampaignID     int64   `db:"campaign_id" json:"campaignId"`
	UserID         *int64  `db:"user_id" json:"userId,omitempty"`
	RecipientName  string  `db:"recipient_name" json:"recipientName"`
	RecipientEmail string  `db:"recipient_email" json:"recipientEmail"`
	RecipientPhone string  `db:"recipient_phone" json:"recipientPhone"`
	Status         string  `db:"status" json:"status"`
	StatusCode     string  `db:"status_code" json:"statusCode"`
	ErrorMessage   string  `db:"error_message" json:"errorMessage"`
	Attempts       int     `db:"attempts" json:"attempts"`
	SentAt         *string `db:"sent_at" json:"sentAt,omitempty"`
}
