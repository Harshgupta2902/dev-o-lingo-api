const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Use absolute path
const roadmapDir = '/Users/harsh/Harsh/codingo/developer-roadmap-master';

function getAllMdFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllMdFiles(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(file);
    }
  });
  return fileList;
}

async function extractExternalIdsAndVerify() {
  try {
    console.log('Gathering files from:', roadmapDir);
    const mdFiles = getAllMdFiles(roadmapDir);
    const fileIds = mdFiles.map(f => {
      const parts = f.split('@');
      if (parts.length > 1) {
        return parts[1].replace('.md', '');
      }
      return null;
    }).filter(Boolean);

    console.log(`Found ${fileIds.length} candidate files in roadmap.`);

    console.log('Extracting external IDs from Database...');
    
    // 1. Get all units
    const units = await prisma.units.findMany({
      select: { id: true, name: true, external_id: true }
    });

    // 2. Get all lessons
    const lessons = await prisma.lessons.findMany({
      select: { id: true, name: true, external_id: true }
    });

    const enrichedUnits = units.map(u => ({
      ...u,
      has_file: fileIds.includes(u.external_id)
    }));

    const enrichedLessons = lessons.map(l => ({
      ...l,
      has_file: fileIds.includes(l.external_id)
    }));

    const data = {
      description: "List of all units and lessons with their external_ids and file availability.",
      timestamp: new Date().toISOString(),
      summary: {
        total_units: units.length,
        units_with_files: enrichedUnits.filter(u => u.has_file).length,
        total_lessons: lessons.length,
        lessons_with_files: enrichedLessons.filter(l => l.has_file).length,
      },
      units: enrichedUnits,
      lessons: enrichedLessons
    };

    const outputPath = path.join(__dirname, '../external_ids_list.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(`Success! Updated external_ids_list.json with file verification.`);
    console.log(`Found ${data.summary.units_with_files} unit files and ${data.summary.lessons_with_files} lesson files.`);

  } catch (err) {
    console.error('Error during extraction/verification:', err);
  } finally {
    await prisma.$disconnect();
  }
}

extractExternalIdsAndVerify();
