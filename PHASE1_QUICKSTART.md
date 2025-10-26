# Phase 1 Quick Start Guide

## Installation (3 minutes)

### Step 1: Install Dependencies

```bash
cd frontend
npm install
```

This installs the new `fs-extra` package and all existing dependencies.

### Step 2: Start the Application

```bash
npm start
```

Or for development with detailed logging:

```bash
npm run dev
```

---

## Testing Phase 1 Infrastructure (5 minutes)

### Option A: Quick Console Test

1. Open the app
2. Press **F12** or **Ctrl+Shift+I** to open DevTools
3. Go to the **Console** tab
4. Run these test commands:

#### Test 1: Check API Availability
```javascript
console.log('Pipeline API:', typeof window.electronAPI.pipeline);
console.log('Database API:', typeof window.electronAPI.database);
console.log('File API:', typeof window.electronAPI.file);
// Should output: "object" for all three
```

#### Test 2: List Pipelines
```javascript
// First, check your backend path in settings
const settings = await window.electronAPI.getSettings();
console.log('Backend path:', settings.etlBackendPath);

// If not set, you'll need to configure it in Settings UI first

// List pipelines (replace with your backend path)
const result = await window.electronAPI.pipeline.list('C:/path/to/backend');
console.log('Found pipelines:', result.pipelines?.length || 0);
console.table(result.pipelines);
```

#### Test 3: Read a Pipeline
```javascript
// Using a path from the previous result
const firstPipeline = result.pipelines[0];
if (firstPipeline) {
  const content = await window.electronAPI.pipeline.read(firstPipeline.path);
  console.log('Pipeline YAML:', content.content.substring(0, 200) + '...');
}
```

#### Test 4: List Transform Files
```javascript
// List SQL transform files (replace with your path)
const sqlFiles = await window.electronAPI.file.list(
  'C:/path/to/backend/schema/transforms/sql'
);
console.log('SQL files:', sqlFiles.files?.length || 0);
console.table(sqlFiles.files);
```

#### Test 5: Test Database Connection
```javascript
// Get schema from a database (replace with your DB path)
const schema = await window.electronAPI.database.getSchema(
  'C:/path/to/backend/out/db/warehouse.duckdb'
);
console.log('Database type:', schema.type);
console.log('Schemas:', Object.keys(schema.schemas || {}));
console.log('Total tables:', schema.tables?.length || 0);
```

#### Test 6: Run a Database Query
```javascript
// Query a table (replace with your DB path and table)
const queryResult = await window.electronAPI.database.query(
  'C:/path/to/backend/out/db/warehouse.duckdb',
  'SELECT * FROM staging.customers LIMIT 5'
);
console.log('Query returned', queryResult.rows?.length || 0, 'rows in', queryResult.duration, 'seconds');
console.table(queryResult.rows);
```

---

### Option B: Automated Test Script

Copy and paste this entire script into the console:

```javascript
// Phase 1 Infrastructure Test Suite
async function testPhase1() {
  console.clear();
  console.log('🧪 Testing Phase 1 Infrastructure...\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function logTest(name, success, message) {
    const icon = success ? '✅' : '❌';
    console.log(`${icon} ${name}: ${message}`);
    results.tests.push({ name, success, message });
    if (success) results.passed++;
    else results.failed++;
  }

  // Test 1: API Availability
  try {
    const hasAPI = typeof window.electronAPI === 'object';
    const hasPipeline = typeof window.electronAPI?.pipeline === 'object';
    const hasDatabase = typeof window.electronAPI?.database === 'object';
    const hasFile = typeof window.electronAPI?.file === 'object';

    if (hasAPI && hasPipeline && hasDatabase && hasFile) {
      logTest('API Availability', true, 'All APIs available');
    } else {
      logTest('API Availability', false, 'Some APIs missing');
    }
  } catch (error) {
    logTest('API Availability', false, error.message);
  }

  // Test 2: Settings
  try {
    const settings = await window.electronAPI.getSettings();
    const hasBackendPath = !!settings.etlBackendPath;
    logTest('Settings', hasBackendPath,
      hasBackendPath ? `Backend: ${settings.etlBackendPath}` : 'No backend path configured'
    );
  } catch (error) {
    logTest('Settings', false, error.message);
  }

  // Test 3: Pipeline List
  try {
    const result = await window.electronAPI.pipeline.list();
    const count = result.pipelines?.length || 0;
    logTest('Pipeline Listing', result.success, `Found ${count} pipelines`);
  } catch (error) {
    logTest('Pipeline Listing', false, error.message);
  }

  // Test 4: File List
  try {
    const result = await window.electronAPI.file.list('.');
    logTest('File Listing', result.success, `Listed ${result.files?.length || 0} files`);
  } catch (error) {
    logTest('File Listing', false, error.message);
  }

  // Test 5: State Management
  try {
    const hasState = typeof state !== 'undefined';
    const hasSetState = typeof setState !== 'undefined';
    const hasPipelineState = state?.pipelines !== undefined;
    logTest('State Management', hasState && hasSetState && hasPipelineState,
      'State system operational'
    );
  } catch (error) {
    logTest('State Management', false, 'State not accessible (expected in module context)');
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Test Results: ${results.passed} passed, ${results.failed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.failed === 0) {
    console.log('🎉 All tests passed! Phase 1 infrastructure is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
  }

  return results;
}

// Run the tests
testPhase1();
```

Expected output:
```
✅ API Availability: All APIs available
✅ Settings: Backend: C:\path\to\backend
✅ Pipeline Listing: Found 3 pipelines
✅ File Listing: Listed 15 files
⚠️  State Management: State not accessible (expected in module context)

📊 Test Results: 4 passed, 1 failed
```

Note: The state management test will fail in console context (it's only accessible in modules), which is expected.

---

## Configure Backend Path (First Time Setup)

If you haven't configured the backend path yet:

1. Click the menu button (⋮) in the top right
2. Select **Settings**
3. You'll need to manually add these fields (or wait for Phase 6):
   - Open browser console
   - Run this command:

```javascript
const settings = await window.electronAPI.getSettings();
settings.etlBackendPath = 'C:/Users/SAI/OneDrive/Documents/developpement/ETL_pipeline_gui/backend';
settings.pipelineConfigPath = settings.etlBackendPath + '/schema';
settings.databasePath = settings.etlBackendPath + '/out/db';
settings.transformsPath = settings.etlBackendPath + '/schema/transforms';
settings.reportsPath = settings.etlBackendPath + '/reports';
await window.electronAPI.saveSettings(settings);
console.log('✅ Settings saved!');
```

Replace the path with your actual backend directory path.

---

## Verify Installation Success

### All 3 of these should work:

1. **Pipeline API**:
   ```javascript
   await window.electronAPI.pipeline.list()
   ```
   → Should return `{ success: true, pipelines: [...] }`

2. **Database API**:
   ```javascript
   await window.electronAPI.database.getSchema('path/to/db.duckdb')
   ```
   → Should return `{ success: true, type: 'duckdb', schemas: {...} }`

3. **File API**:
   ```javascript
   await window.electronAPI.file.list('.')
   ```
   → Should return `{ success: true, files: [...] }`

---

## Common Issues

### ❌ "Cannot find module 'fs-extra'"
**Solution**: Run `npm install` in the frontend directory

### ❌ "Pipeline directory not configured"
**Solution**: Configure `etlBackendPath` in settings (see above)

### ❌ "Python not found"
**Solution**: Ensure Python is installed and in your system PATH

### ❌ "Database file not found"
**Solution**: Verify the database path is correct and file exists

### ❌ All tests return `undefined`
**Solution**: Make sure to `await` the promises:
```javascript
// ❌ Wrong
window.electronAPI.pipeline.list();

// ✅ Correct
await window.electronAPI.pipeline.list();
```

---

## Next Steps After Successful Testing

Once Phase 1 is verified:

1. ✅ Infrastructure is ready
2. 🚀 Proceed to **Phase 2: Pipeline Builder**
3. 📝 Follow `FRONTEND_PLAN.md` for implementation details

---

## Need Help?

Check these files:
- **Full testing guide**: [PHASE1_IMPLEMENTATION.md](PHASE1_IMPLEMENTATION.md)
- **Complete summary**: [PHASE1_SUMMARY.md](PHASE1_SUMMARY.md)
- **Implementation plan**: [FRONTEND_PLAN.md](FRONTEND_PLAN.md)

---

**Ready to build the UI!** 🎨
