-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('CASHIER', 'QR_TABLE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSoldOut" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "diningTableId" TEXT,
    "createdByUserId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "customerName" TEXT,
    "note" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "serviceAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "menuNameSnapshot" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "subtotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuCategory_tenantId_outletId_isActive_sortOrder_idx" ON "MenuCategory"("tenantId", "outletId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_tenantId_outletId_id_key" ON "MenuCategory"("tenantId", "outletId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_tenantId_outletId_name_key" ON "MenuCategory"("tenantId", "outletId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_outletId_categoryId_isActive_sortOrder_idx" ON "MenuItem"("tenantId", "outletId", "categoryId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_tenantId_outletId_id_key" ON "MenuItem"("tenantId", "outletId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_tenantId_outletId_name_key" ON "MenuItem"("tenantId", "outletId", "name");

-- CreateIndex
CREATE INDEX "CustomerOrder_tenantId_outletId_status_createdAt_idx" ON "CustomerOrder"("tenantId", "outletId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerOrder_tenantId_outletId_diningTableId_status_idx" ON "CustomerOrder"("tenantId", "outletId", "diningTableId", "status");

-- CreateIndex
CREATE INDEX "CustomerOrder_tenantId_createdByUserId_createdAt_idx" ON "CustomerOrder"("tenantId", "createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_tenantId_outletId_id_key" ON "CustomerOrder"("tenantId", "outletId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_tenantId_outletId_orderNumber_key" ON "CustomerOrder"("tenantId", "outletId", "orderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_outletId_orderId_idx" ON "OrderItem"("tenantId", "outletId", "orderId");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_outletId_menuItemId_idx" ON "OrderItem"("tenantId", "outletId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_outletId_id_key" ON "DiningTable"("outletId", "id");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_tenantId_outletId_fkey" FOREIGN KEY ("tenantId", "outletId") REFERENCES "Outlet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_outletId_fkey" FOREIGN KEY ("tenantId", "outletId") REFERENCES "Outlet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_outletId_categoryId_fkey" FOREIGN KEY ("tenantId", "outletId", "categoryId") REFERENCES "MenuCategory"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_tenantId_outletId_fkey" FOREIGN KEY ("tenantId", "outletId") REFERENCES "Outlet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_outletId_diningTableId_fkey" FOREIGN KEY ("outletId", "diningTableId") REFERENCES "DiningTable"("outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_tenantId_createdByUserId_fkey" FOREIGN KEY ("tenantId", "createdByUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_outletId_orderId_fkey" FOREIGN KEY ("tenantId", "outletId", "orderId") REFERENCES "CustomerOrder"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_outletId_menuItemId_fkey" FOREIGN KEY ("tenantId", "outletId", "menuItemId") REFERENCES "MenuItem"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
