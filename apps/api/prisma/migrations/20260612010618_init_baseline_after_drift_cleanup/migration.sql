-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'DEPT_HEAD', 'SALES', 'VIEWER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'LOST', 'PAUSED');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DataQuality" AS ENUM ('COMPLETE', 'PARTIAL', 'POOR');

-- CreateEnum
CREATE TYPE "DecisionRole" AS ENUM ('COACH', 'EVALUATOR', 'DECISION_MAKER', 'USER', 'GATEKEEPER');

-- CreateEnum
CREATE TYPE "Attitude" AS ENUM ('SUPPORTIVE', 'NEUTRAL', 'RESISTANT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxStorageMb" INTEGER NOT NULL DEFAULT 1024,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'SALES',
    "status" TEXT NOT NULL DEFAULT 'active',
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT 'education',
    "status" "LeadStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'cold_call',
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactPosition" TEXT,
    "contactEmail" TEXT,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiExtracted" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DOUBLE PRECISION,
    "humanInfo" JSONB NOT NULL DEFAULT '{}',
    "businessInfo" JSONB NOT NULL DEFAULT '{}',
    "financeInfo" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "convertedAt" TIMESTAMP(3),
    "convertedProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT 'education',
    "amount" DECIMAL(15,2),
    "milestone" INTEGER NOT NULL DEFAULT 0,
    "milestoneHistory" JSONB NOT NULL DEFAULT '[]',
    "humanInfo" JSONB NOT NULL DEFAULT '{}',
    "businessInfo" JSONB NOT NULL DEFAULT '{}',
    "financeInfo" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "evidenceChain" JSONB NOT NULL DEFAULT '[]',
    "decisionMap" JSONB NOT NULL DEFAULT '{}',
    "healthScore" INTEGER DEFAULT 60,
    "healthHistory" JSONB NOT NULL DEFAULT '[]',
    "healthRadar" JSONB NOT NULL DEFAULT '{}',
    "urgency" "Urgency" NOT NULL DEFAULT 'MEDIUM',
    "nextFollowUp" TIMESTAMP(3),
    "lastVisitTime" TIMESTAMP(3),
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "staleSince" TIMESTAMP(3),
    "staleReason" TEXT,
    "winProbability" INTEGER,
    "probabilityConfidence" DOUBLE PRECISION DEFAULT 1.0,
    "probabilityHistory" JSONB NOT NULL DEFAULT '[]',
    "dataQuality" "DataQuality" NOT NULL DEFAULT 'COMPLETE',
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiExtracted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "lostInfo" JSONB,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "scale" TEXT,
    "region" TEXT,
    "level" TEXT,
    "address" TEXT,
    "website" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "source" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "department" TEXT,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "wechat" TEXT,
    "decisionRole" "DecisionRole",
    "roleConfidence" TEXT,
    "personalMotive" TEXT,
    "roiConcern" TEXT,
    "riskConcern" TEXT,
    "pressurePoints" TEXT,
    "howToReach" TEXT,
    "howToPersuade" TEXT,
    "aiTagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "attitude" "Attitude" NOT NULL DEFAULT 'NEUTRAL',
    "trustLevel" INTEGER DEFAULT 50,
    "personalMotive" TEXT,
    "pressurePoints" TEXT,
    "decisionTimeline" TEXT,
    "howToReach" TEXT,
    "howToPersuade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT NOT NULL,
    "visitTime" TIMESTAMP(3) NOT NULL,
    "visitType" TEXT NOT NULL,
    "sceneType" TEXT,
    "summary" TEXT,
    "audioUrl" TEXT,
    "audioTranscript" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "aiAnalysis" JSONB NOT NULL DEFAULT '{}',
    "extractedTasks" JSONB NOT NULL DEFAULT '[]',
    "milestoneBefore" INTEGER,
    "milestoneAfter" INTEGER,
    "milestoneChanged" BOOLEAN NOT NULL DEFAULT false,
    "nextAction" TEXT,
    "nextActionDeadline" TIMESTAMP(3),
    "contactName" TEXT,
    "contactPosition" TEXT,
    "contactRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workflowStage" TEXT NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitClosure" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT NOT NULL,
    "hasPreparation" BOOLEAN NOT NULL DEFAULT false,
    "hasRecording" BOOLEAN NOT NULL DEFAULT false,
    "hasSummary" BOOLEAN NOT NULL DEFAULT false,
    "hasAiAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "hasFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" INTEGER DEFAULT 0,
    "qualityFactors" JSONB NOT NULL DEFAULT '{}',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT,
    "sourceId" TEXT,
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodologyConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "moduleType" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MethodologyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT,
    "orgId" TEXT,
    "customerId" TEXT NOT NULL,
    "customerType" TEXT NOT NULL DEFAULT 'company',
    "projectId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventSubtype" TEXT,
    "eventData" JSONB NOT NULL DEFAULT '{}',
    "cognitivePayload" JSONB NOT NULL DEFAULT '{}',
    "mutations" JSONB NOT NULL DEFAULT '{}',
    "transcriptUrl" TEXT,
    "aiInsight" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceLabel" TEXT,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT,
    "weeklySummary" TEXT,
    "monthlySummary" TEXT,
    "quarterlyView" TEXT,
    "currentStage" TEXT,
    "stageDuration" INTEGER,
    "healthScore" INTEGER,
    "riskFlags" JSONB NOT NULL DEFAULT '[]',
    "nextActions" JSONB NOT NULL DEFAULT '[]',
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PERSONAL',
    "orgId" TEXT,

    CONSTRAINT "KbDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector,

    CONSTRAINT "KbChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehaviorLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT,
    "visitId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BehaviorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodType" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER,
    "periodQuarter" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiEndpoint" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 4000,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB DEFAULT '[]',
    "toolResults" JSONB DEFAULT '[]',
    "latencyMs" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_orgId_idx" ON "User"("tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Org_tenantId_idx" ON "Org"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_token_idx" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "Lead_tenantId_ownerId_idx" ON "Lead"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Lead_tenantId_completenessScore_idx" ON "Lead"("tenantId", "completenessScore");

-- CreateIndex
CREATE INDEX "Lead_tenantId_deletedAt_idx" ON "Lead"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Project_tenantId_ownerId_idx" ON "Project"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Project_tenantId_milestone_idx" ON "Project"("tenantId", "milestone");

-- CreateIndex
CREATE INDEX "Project_tenantId_isStale_idx" ON "Project"("tenantId", "isStale");

-- CreateIndex
CREATE INDEX "Project_tenantId_healthScore_idx" ON "Project"("tenantId", "healthScore");

-- CreateIndex
CREATE INDEX "Project_tenantId_deletedAt_idx" ON "Project"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Company_tenantId_name_idx" ON "Company"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Company_tenantId_ownerId_idx" ON "Company"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Company_tenantId_deletedAt_idx" ON "Company"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Contact_tenantId_name_idx" ON "Contact"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Contact_tenantId_decisionRole_idx" ON "Contact"("tenantId", "decisionRole");

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_idx" ON "ProjectContact"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContact_projectId_contactId_key" ON "ProjectContact"("projectId", "contactId");

-- CreateIndex
CREATE INDEX "Visit_tenantId_projectId_idx" ON "Visit"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Visit_tenantId_ownerId_idx" ON "Visit"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Visit_tenantId_visitTime_idx" ON "Visit"("tenantId", "visitTime");

-- CreateIndex
CREATE UNIQUE INDEX "VisitClosure_visitId_key" ON "VisitClosure"("visitId");

-- CreateIndex
CREATE INDEX "VisitClosure_projectId_closedAt_idx" ON "VisitClosure"("projectId", "closedAt");

-- CreateIndex
CREATE INDEX "VisitClosure_ownerId_createdAt_idx" ON "VisitClosure"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_tenantId_ownerId_idx" ON "Task"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_deadline_idx" ON "Task"("tenantId", "deadline");

-- CreateIndex
CREATE INDEX "MethodologyConfig_tenantId_moduleType_isActive_idx" ON "MethodologyConfig"("tenantId", "moduleType", "isActive");

-- CreateIndex
CREATE INDEX "MethodologyConfig_tenantId_updatedAt_idx" ON "MethodologyConfig"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_tenantId_ownerId_eventTime_idx" ON "TimelineEvent"("tenantId", "ownerId", "eventTime");

-- CreateIndex
CREATE INDEX "TimelineEvent_tenantId_orgId_eventTime_idx" ON "TimelineEvent"("tenantId", "orgId", "eventTime");

-- CreateIndex
CREATE INDEX "TimelineEvent_tenantId_customerId_eventTime_idx" ON "TimelineEvent"("tenantId", "customerId", "eventTime");

-- CreateIndex
CREATE INDEX "TimelineEvent_tenantId_projectId_eventTime_idx" ON "TimelineEvent"("tenantId", "projectId", "eventTime");

-- CreateIndex
CREATE INDEX "TimelineEvent_tenantId_eventType_createdAt_idx" ON "TimelineEvent"("tenantId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "TimelineEvent_tenantId_sourceType_sourceId_idx" ON "TimelineEvent"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CustomerSnapshot_tenantId_customerId_generatedAt_idx" ON "CustomerSnapshot"("tenantId", "customerId", "generatedAt");

-- CreateIndex
CREATE INDEX "CustomerSnapshot_tenantId_projectId_generatedAt_idx" ON "CustomerSnapshot"("tenantId", "projectId", "generatedAt");

-- CreateIndex
CREATE INDEX "CustomerSnapshot_tenantId_expiresAt_idx" ON "CustomerSnapshot"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "KbDocument_tenantId_category_idx" ON "KbDocument"("tenantId", "category");

-- CreateIndex
CREATE INDEX "KbDocument_tenantId_status_idx" ON "KbDocument"("tenantId", "status");

-- CreateIndex
CREATE INDEX "KbChunk_documentId_idx" ON "KbChunk"("documentId");

-- CreateIndex
CREATE INDEX "BehaviorLog_tenantId_userId_createdAt_idx" ON "BehaviorLog"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "BehaviorLog_tenantId_type_idx" ON "BehaviorLog"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Goal_tenantId_orgId_idx" ON "Goal"("tenantId", "orgId");

-- CreateIndex
CREATE INDEX "Goal_tenantId_userId_idx" ON "Goal"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AiConfig_tenantId_isDefault_key" ON "AiConfig"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "ChatSession_tenantId_userId_updatedAt_idx" ON "ChatSession"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_tenantId_idx" ON "ChatMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Org" ADD CONSTRAINT "Org_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitClosure" ADD CONSTRAINT "VisitClosure_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitClosure" ADD CONSTRAINT "VisitClosure_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodologyConfig" ADD CONSTRAINT "MethodologyConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSnapshot" ADD CONSTRAINT "CustomerSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSnapshot" ADD CONSTRAINT "CustomerSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbDocument" ADD CONSTRAINT "KbDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbChunk" ADD CONSTRAINT "KbChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KbDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorLog" ADD CONSTRAINT "BehaviorLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorLog" ADD CONSTRAINT "BehaviorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConfig" ADD CONSTRAINT "AiConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
