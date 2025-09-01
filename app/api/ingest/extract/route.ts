import { NextRequest, NextResponse } from 'next/server';
import { extractText, extractFromPastedHTML, type ExtractedText } from '@/lib/server/extractText';

export async function POST(request: NextRequest) {
  console.log('📝 Extract API called:', {
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url
  });
  
  try {
    const contentType = request.headers.get('content-type') || '';
    console.log('📄 Content-Type:', contentType);

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        console.error('❌ No file provided in form data');
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }
      
      console.log('📁 File received:', {
        name: file.name,
        size: file.size,
        type: file.type
      });

      // Validate file type
      const validTypes = [
        'application/pdf',
        'message/rfc822',
        'text/html',
        'application/octet-stream' // For .eml files
      ];
      const validExtensions = ['.pdf', '.eml', '.html', '.htm'];
      
      const isValidType = validTypes.includes(file.type);
      const isValidExtension = validExtensions.some(ext => 
        file.name.toLowerCase().endsWith(ext)
      );
      
      if (!isValidType && !isValidExtension) {
        console.error('❌ Invalid file type:', {
          fileName: file.name,
          fileType: file.type,
          isValidType,
          isValidExtension
        });
        return NextResponse.json(
          { error: 'Invalid file type. Please upload PDF, EML, or HTML files only.' },
          { status: 400 }
        );
      }

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        console.error('❌ File too large:', {
          fileName: file.name,
          fileSize: file.size,
          maxSize: 10 * 1024 * 1024
        });
        return NextResponse.json(
          { error: 'File too large. Maximum size is 10MB.' },
          { status: 400 }
        );
      }
      
      console.log('✅ File validation passed, starting extraction...');

      const result = await extractText(file);

      if (result.error) {
        console.error('❌ Text extraction failed:', {
          fileName: file.name,
          error: result.error
        });
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        );
      }
      
      console.log('✅ Text extraction successful:', {
        fileName: file.name,
        textLength: result.text?.length || 0,
        htmlLength: result.html?.length || 0
      });

      return NextResponse.json({
        success: true,
        data: result,
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        }
      });

    } else if (contentType.includes('application/json')) {
      // Handle pasted HTML content
      const body = await request.json();
      const { html } = body;

      if (!html || typeof html !== 'string') {
        console.error('❌ Invalid HTML content:', {
          hasHtml: !!html,
          htmlType: typeof html
        });
        return NextResponse.json(
          { error: 'HTML content is required' },
          { status: 400 }
        );
      }
      
      console.log('🌐 HTML content received:', {
        length: html.length
      });

      if (html.length > 1024 * 1024) { // 1MB limit for HTML
        console.error('❌ HTML content too large:', {
          length: html.length,
          maxLength: 1024 * 1024
        });
        return NextResponse.json(
          { error: 'HTML content too large. Maximum size is 1MB.' },
          { status: 400 }
        );
      }

      const result = extractFromPastedHTML(html);

      return NextResponse.json({
        success: true,
        data: result,
        metadata: {
          contentLength: html.length,
          source: 'pasted_html'
        }
      });

    } else {
      console.error('❌ Invalid content type:', {
        contentType,
        supportedTypes: ['multipart/form-data', 'application/json']
      });
      return NextResponse.json(
        { error: 'Invalid content type' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('❌ Extract API critical error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { 
      message: 'Extract API endpoint',
      supportedTypes: ['PDF', 'EML', 'HTML'],
      maxFileSize: '10MB',
      methods: ['POST']
    },
    { status: 200 }
  );
}