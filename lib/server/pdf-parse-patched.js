// Patched version of pdf-parse that bypasses the debug mode issue
// This directly loads the core library without the debug wrapper

let pdfParse;

try {
  // Try to load the core pdf-parse library directly, bypassing the index.js debug code
  pdfParse = require('pdf-parse/lib/pdf-parse.js');
  console.log('✓ PDF parser loaded successfully');
} catch (primaryError) {
  console.warn('Failed to load pdf-parse/lib/pdf-parse.js, trying fallback:', primaryError.message);
  
  try {
    // Fallback: try the main pdf-parse module
    pdfParse = require('pdf-parse');
    console.log('✓ PDF parser loaded via fallback');
  } catch (fallbackError) {
    console.error('❌ Failed to load pdf-parse library:', {
      primaryError: primaryError.message,
      fallbackError: fallbackError.message
    });
    
    // Export a function that throws an informative error
    pdfParse = () => {
      throw new Error(`PDF parsing unavailable: ${primaryError.message} | Fallback: ${fallbackError.message}`);
    };
  }
}

module.exports = pdfParse;