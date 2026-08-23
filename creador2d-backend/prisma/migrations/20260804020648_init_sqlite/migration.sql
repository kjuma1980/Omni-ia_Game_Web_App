-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CREATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "replacedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "block_definitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "worldTypes" TEXT NOT NULL DEFAULT '[]',
    "layer" TEXT NOT NULL,
    "collisionFlags" INTEGER NOT NULL DEFAULT 0,
    "biome" TEXT NOT NULL DEFAULT 'generic',
    "visual" JSONB NOT NULL,
    "ySortOffset" INTEGER NOT NULL DEFAULT 0,
    "heightInTiles" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL DEFAULT 'TERRAIN',
    "placement" TEXT NOT NULL DEFAULT 'GRID',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "variant" INTEGER NOT NULL DEFAULT 1,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "entrance" BOOLEAN NOT NULL DEFAULT false,
    "breakable" BOOLEAN NOT NULL DEFAULT true,
    "craftable" BOOLEAN NOT NULL DEFAULT false,
    "recipe" JSONB,
    "dropQuantity" INTEGER NOT NULL DEFAULT 1,
    "defaultScale" REAL NOT NULL DEFAULT 1,
    "origin" TEXT NOT NULL DEFAULT 'PROCEDURAL',
    "imageData" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "worlds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "tileSize" INTEGER NOT NULL DEFAULT 32,
    "chunkSize" INTEGER NOT NULL DEFAULT 16,
    "biome" TEXT NOT NULL DEFAULT 'grassland',
    "seed" INTEGER NOT NULL DEFAULT 0,
    "background" TEXT NOT NULL DEFAULT '#0b1120',
    "gravity" REAL NOT NULL DEFAULT 9.8,
    "gridAngle" REAL NOT NULL DEFAULT 0,
    "laneCount" INTEGER NOT NULL DEFAULT 3,
    "laneWidth" INTEGER NOT NULL DEFAULT 2,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" DATETIME,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isInterior" BOOLEAN NOT NULL DEFAULT false,
    "parentWorldId" TEXT,
    "entranceTileX" INTEGER,
    "entranceTileY" INTEGER,
    CONSTRAINT "worlds_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "worlds_parentWorldId_fkey" FOREIGN KEY ("parentWorldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "parallax_layers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "prompt" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'PROCEDURAL',
    "speedX" REAL NOT NULL DEFAULT 0.2,
    "speedY" REAL NOT NULL DEFAULT 0.1,
    "opacity" REAL NOT NULL DEFAULT 1,
    "tint" TEXT NOT NULL DEFAULT '#ffffff',
    "repeatX" BOOLEAN NOT NULL DEFAULT true,
    "repeatY" BOOLEAN NOT NULL DEFAULT false,
    "offsetY" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "parallax_layers_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "weather_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NONE',
    "intensity" REAL NOT NULL DEFAULT 0.5,
    "windDirection" TEXT NOT NULL DEFAULT 'DOWN',
    "windStrength" REAL NOT NULL DEFAULT 0.3,
    "fogDensity" REAL NOT NULL DEFAULT 0,
    "tint" TEXT NOT NULL DEFAULT '#9fb4c7',
    "emissionRate" INTEGER NOT NULL DEFAULT 400,
    "lightning" BOOLEAN NOT NULL DEFAULT false,
    "lightningEvery" REAL NOT NULL DEFAULT 7,
    "lightningTint" TEXT NOT NULL DEFAULT '#dbe9ff',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "weather_settings_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fluid_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "flow" TEXT NOT NULL DEFAULT 'STILL',
    "speed" REAL NOT NULL DEFAULT 0.4,
    "waveHeight" REAL NOT NULL DEFAULT 0.15,
    "bubbles" BOOLEAN NOT NULL DEFAULT false,
    "bubbleRate" INTEGER NOT NULL DEFAULT 6,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fluid_settings_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fluid_settings_blockKey_fkey" FOREIGN KEY ("blockKey") REFERENCES "block_definitions" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "placed_objects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "rotation" REAL NOT NULL DEFAULT 0,
    "scale" REAL NOT NULL DEFAULT 1,
    "flipX" BOOLEAN NOT NULL DEFAULT false,
    "layer" TEXT NOT NULL DEFAULT 'WALL',
    "zOffset" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "placed_objects_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "placed_objects_blockKey_fkey" FOREIGN KEY ("blockKey") REFERENCES "block_definitions" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "world_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "world_members_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "world_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "cx" INTEGER NOT NULL,
    "cy" INTEGER NOT NULL,
    "palette" JSONB NOT NULL,
    "layers" JSONB NOT NULL,
    "collision" BLOB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chunks_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "player_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inventory_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "player_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_items_blockKey_fkey" FOREIGN KEY ("blockKey") REFERENCES "block_definitions" ("key") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 10,
    "criteria" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "unlocked_achievements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unlocked_achievements_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "player_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "unlocked_achievements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "operations" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ai_suggestions_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "worlds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ai_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "block_definitions_key_key" ON "block_definitions"("key");

-- CreateIndex
CREATE INDEX "block_definitions_layer_idx" ON "block_definitions"("layer");

-- CreateIndex
CREATE INDEX "block_definitions_biome_idx" ON "block_definitions"("biome");

-- CreateIndex
CREATE INDEX "block_definitions_category_idx" ON "block_definitions"("category");

-- CreateIndex
CREATE UNIQUE INDEX "worlds_slug_key" ON "worlds"("slug");

-- CreateIndex
CREATE INDEX "worlds_ownerId_idx" ON "worlds"("ownerId");

-- CreateIndex
CREATE INDEX "worlds_type_idx" ON "worlds"("type");

-- CreateIndex
CREATE INDEX "worlds_parentWorldId_idx" ON "worlds"("parentWorldId");

-- CreateIndex
CREATE INDEX "parallax_layers_worldId_kind_idx" ON "parallax_layers"("worldId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "weather_settings_worldId_key" ON "weather_settings"("worldId");

-- CreateIndex
CREATE INDEX "fluid_settings_worldId_idx" ON "fluid_settings"("worldId");

-- CreateIndex
CREATE UNIQUE INDEX "fluid_settings_worldId_blockKey_key" ON "fluid_settings"("worldId", "blockKey");

-- CreateIndex
CREATE INDEX "placed_objects_worldId_idx" ON "placed_objects"("worldId");

-- CreateIndex
CREATE INDEX "world_members_userId_idx" ON "world_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "world_members_worldId_userId_key" ON "world_members"("worldId", "userId");

-- CreateIndex
CREATE INDEX "chunks_worldId_idx" ON "chunks"("worldId");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_worldId_cx_cy_key" ON "chunks"("worldId", "cx", "cy");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_userId_key" ON "player_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_profileId_blockKey_key" ON "inventory_items"("profileId", "blockKey");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_key_key" ON "achievements"("key");

-- CreateIndex
CREATE UNIQUE INDEX "unlocked_achievements_profileId_achievementId_key" ON "unlocked_achievements"("profileId", "achievementId");

-- CreateIndex
CREATE INDEX "ai_suggestions_worldId_idx" ON "ai_suggestions"("worldId");

-- CreateIndex
CREATE INDEX "ai_suggestions_status_idx" ON "ai_suggestions"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
