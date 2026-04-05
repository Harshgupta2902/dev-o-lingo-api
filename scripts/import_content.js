const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const roadmapDir = '/Users/harsh/Harsh/codingo/developer-roadmap-master';

// Function to scan all markdown files once and create a mapping
function mapAllMdFiles(dir, map = {}) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      mapAllMdFiles(filePath, map);
    } else if (file.endsWith('.md')) {
      const parts = file.split('@');
      if (parts.length > 1) {
        const external_id = parts[1].replace('.md', '');
        map[external_id] = filePath;
      }
    }
  }
  return map;
}

async function fastImport() {
  try {
    console.log('🔄 Scanning roadmap directory once...');
    const fileMap = mapAllMdFiles(roadmapDir);
    const foundFilesCount = Object.keys(fileMap).length;
    console.log(`✅ Scanned ${foundFilesCount} files with external IDs.`);

    // 1. Get all units and lessons from DB
    const [units, lessons] = await Promise.all([
      prisma.units.findMany({ select: { id: true, name: true, external_id: true } }),
      prisma.lessons.findMany({ select: { id: true, name: true, external_id: true } })
    ]);

    console.log(`📋 DB Record Counts: ${units.length} Units, ${lessons.length} Lessons.`);

    // 2. Process Units
    console.log('\n📦 --- STARTING UNITS CONTENT IMPORT ---');
    for (const unit of units) {
      const filePath = fileMap[unit.external_id];
      if (filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        await prisma.units.update({
          where: { id: unit.id },
          data: { description: content }
        });
        console.log(`✅ [UNIT ${unit.id}] Content imported for: ${unit.name}`);
      } else {
        console.log(`⚠️ [UNIT ${unit.id}] NO FILE FOUND for: ${unit.name} (${unit.external_id})`);
      }
    }

    // 3. Process Lessons
    console.log('\n📘 --- STARTING LESSONS CONTENT IMPORT ---');
    for (const lesson of lessons) {
      const filePath = fileMap[lesson.external_id];
      if (filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        await prisma.lessons.update({
          where: { id: lesson.id },
          data: { description: content }
        });
        console.log(`✅ [LESSON ${lesson.id}] Content imported for: ${lesson.name}`);
      } else {
        console.log(`⚠️ [LESSON ${lesson.id}] NO FILE FOUND for: ${lesson.name} (${lesson.external_id})`);
      }
    }

    console.log('\n✨ ALL DONE! Roadmap content is now in your database with full logs.');

  } catch (err) {
    console.error('❌ Error during import:', err);
  } finally {
    await prisma.$disconnect();
  }
}

fastImport();
