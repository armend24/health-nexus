import * as React from 'react';

import type { Contract } from '@/interfaces/contract';
import { API_BASE_URL } from '@/lib/api-client';

/**
 * We keep the primitive types loose because the PDF renderer is loaded dynamically at runtime.
 * This avoids hard build-time coupling when the package is temporarily unavailable.
 */
export interface ReactPdfPrimitives {
  Document: React.ComponentType<React.PropsWithChildren>;
  Page: React.ComponentType<
    React.PropsWithChildren<Record<string, unknown>>
  >;
  Text: React.ComponentType<
    React.PropsWithChildren<Record<string, unknown>>
  >;
  View: React.ComponentType<
    React.PropsWithChildren<Record<string, unknown>>
  >;
  Image: React.ComponentType<Record<string, unknown>>;
  StyleSheet: {
    create: (
      styles: Record<string, unknown>
    ) => Record<string, unknown>;
  };
}

interface ContractPdfDocumentProps {
  contract: Contract;
  primitives: ReactPdfPrimitives;
}

/**
 * Contract terms are stored as HTML, but PDF text blocks should render plain text reliably.
 * We strip tags so the generated PDF remains stable regardless of HTML complexity.
 */
export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ''
    )
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSalary(
  value: string | number | undefined | null
): string {
  if (value == null || value === '') return '-';
  return `€${String(value)}`;
}

/** Unique key counter for PDF HTML renderer */
let _htmlKey = 0;

/**
 * Parse HTML and render as React-PDF View/Text elements. Handles common TipTap output:
 * p, strong, em, u, s, ul, ol, li, h2, h3, h4, br, span (with style).
 */
function renderHtmlToPdf(
  html: string,
  primitives: Pick<ReactPdfPrimitives, 'Text' | 'View'>,
  baseStyle: Record<string, unknown>
): React.ReactNode[] {
  const { Text, View } = primitives;
  if (!html?.trim()) return [];

  const doc =
    typeof document !== 'undefined'
      ? new DOMParser().parseFromString(html, 'text/html')
      : null;
  if (!doc?.body) {
    return [
      <Text key={`f-${_htmlKey++}`} style={baseStyle}>
        {stripHtmlToPlainText(html) || '-'}
      </Text>,
    ];
  }

  const walk = (el: ChildNode): React.ReactNode[] => {
    if (el.nodeType === Node.TEXT_NODE) {
      const t = (el as Text).textContent?.trim();
      return t
        ? [
            <Text key={`t-${_htmlKey++}`} style={baseStyle}>
              {t}{' '}
            </Text>,
          ]
        : [];
    }
    if (el.nodeType !== Node.ELEMENT_NODE) return [];
    const tag = (el as Element).tagName.toLowerCase();
    const children = Array.from(el.childNodes).flatMap((c) =>
      walk(c)
    );
    const getStyle = (): Record<string, unknown> => {
      if (tag === 'strong' || tag === 'b')
        return { ...baseStyle, fontWeight: 700 };
      if (tag === 'em' || tag === 'i')
        return {
          ...baseStyle,
          fontStyle: 'italic',
        };
      if (tag === 'u')
        return {
          ...baseStyle,
          textDecoration: 'underline',
        };
      if (tag === 's')
        return {
          ...baseStyle,
          textDecoration: 'line-through',
        };
      if (tag === 'h2')
        return {
          ...baseStyle,
          fontSize: 14,
          fontWeight: 700,
          marginTop: 8,
          marginBottom: 4,
        };
      if (tag === 'h3')
        return {
          ...baseStyle,
          fontSize: 12,
          fontWeight: 700,
          marginTop: 6,
          marginBottom: 2,
        };
      if (tag === 'h4')
        return {
          ...baseStyle,
          fontSize: 11,
          fontWeight: 700,
          marginTop: 4,
          marginBottom: 2,
        };
      const style = (el as HTMLElement).style;
      if (style?.fontSize) {
        const m = style.fontSize.match(/^(\d+(?:\.\d+)?)px$/);
        if (m)
          return {
            ...baseStyle,
            fontSize: Number(m[1]),
          };
      }
      return { ...baseStyle };
    };
    if (tag === 'br')
      return [
        <Text key={`br-${_htmlKey++}`} style={baseStyle}>
          {'\n'}
        </Text>,
      ];
    if (tag === 'p' || tag === 'div') {
      return [
        <View
          key={`${tag}-${_htmlKey++}`}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginBottom: 6,
          }}
        >
          {children.length
            ? children
            : [<Text key={`p-${_htmlKey++}`}> </Text>]}
        </View>,
      ];
    }
    if (tag === 'ul' || tag === 'ol') {
      return [
        <View
          key={`${tag}-${_htmlKey++}`}
          style={{
            marginBottom: 6,
            marginLeft: 8,
          }}
        >
          {children}
        </View>,
      ];
    }
    if (tag === 'li') {
      return [
        <View
          key={`li-${_htmlKey++}`}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginBottom: 2,
            marginLeft: 8,
          }}
        >
          <Text style={getStyle()}>• </Text>
          {children}
        </View>,
      ];
    }
    if (
      [
        'strong',
        'b',
        'em',
        'i',
        'u',
        's',
        'span',
        'h2',
        'h3',
        'h4',
      ].includes(tag)
    ) {
      return [
        <Text key={`${tag}-${_htmlKey++}`} style={getStyle()}>
          {children}
        </Text>,
      ];
    }
    return children;
  };

  const result = Array.from(doc.body.childNodes).flatMap((n) =>
    walk(n)
  );
  return result.length
    ? result
    : [
        <Text key={`e-${_htmlKey++}`} style={baseStyle}>
          -
        </Text>,
      ];
}

/**
 * Backend may return relative signature paths (e.g. /uploads/signatures/file.png).
 * PDF renderer needs absolute URLs, so we prepend API_BASE_URL when needed.
 */
function resolveAssetUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://'))
    return url;
  if (url.startsWith('/')) {
    return `${API_BASE_URL.replace(/\/+$/, '')}${url}`;
  }
  return `${API_BASE_URL.replace(/\/+$/, '')}/${url}`;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ContractPdfDocument({
  contract,
  primitives,
}: ContractPdfDocumentProps) {
  const { Document, Page, Text, View, Image, StyleSheet } =
    primitives;

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        page: {
          padding: 36,
          fontSize: 10,
          lineHeight: 1.5,
          fontFamily: 'Helvetica',
          backgroundColor: '#ffffff',
        },
        header: {
          paddingBottom: 10,
          marginBottom: 10,
          borderBottomWidth: 2,
          borderBottomColor: '#1f2937',
        },
        title: {
          fontSize: 24,
          marginBottom: 4,
          fontWeight: 700,
          color: '#111827',
          letterSpacing: -0.5,
        },
        subtitle: {
          fontSize: 11,
          color: '#6b7280',
          marginTop: 4,
        },
        section: {
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f9fafb',
          borderRadius: 6,
          borderLeftWidth: 4,
          borderLeftColor: '#3b82f6',
        },
        sectionLabel: {
          fontSize: 11,
          fontWeight: 700,
          color: '#374151',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        label: {
          fontWeight: 600,
          color: '#4b5563',
        },
        row: {
          marginBottom: 6,
          flexDirection: 'row',
        },
        rowLabel: {
          width: 100,
          fontWeight: 600,
          color: '#6b7280',
        },
        signatures: {
          flexDirection: 'row',
          gap: 24,
          marginTop: 20,
        },
        signatureBlock: {
          flex: 1,
          padding: 16,
          backgroundColor: '#f9fafb',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#e5e7eb',
          minHeight: 100,
        },
        signatureLabel: {
          fontSize: 11,
          fontWeight: 700,
          color: '#374151',
          marginBottom: 4,
        },
        signatureDate: {
          fontSize: 9,
          color: '#6b7280',
          marginBottom: 8,
        },
        signatureImage: {
          width: '100%',
          height: 60,
          objectFit: 'contain',
          marginTop: 4,
        },
      }),
    [StyleSheet]
  );

  const doctorSignatureUrl = resolveAssetUrl(
    contract.doctor_signature
  );
  const hospitalSignatureUrl = resolveAssetUrl(
    contract.hospital_signature
  );
  const termsPdfNodes = renderHtmlToPdf(
    contract.terms_content || '',
    primitives,
    {
      fontSize: 10,
      lineHeight: 1.5,
      color: '#374151',
    }
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Doctor Contract</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Contract Details</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Tenant:</Text>
            <Text>
              {contract.tenant_name || `ID ${contract.tenant_id}`}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Doctor:</Text>
            <Text>{contract.doctor_name || 'Assigned doctor'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Salary:</Text>
            <Text>{formatSalary(contract.salary)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Start Date:</Text>
            <Text>{formatDate(contract.start_date)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>End Date:</Text>
            <Text>{formatDate(contract.end_date)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Terms</Text>
          <View>{termsPdfNodes}</View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Lifecycle</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Activated:</Text>
            <Text>{formatDate(contract.activated_at)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Expires:</Text>
            <Text>{formatDate(contract.expires_at)}</Text>
          </View>
          {contract.terminated_reason ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Terminated:</Text>
              <Text>{contract.terminated_reason}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Updated:</Text>
            <Text>{formatDate(contract.updated_at)}</Text>
          </View>
        </View>

        <View style={styles.signatures}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>
              Doctor Signature
            </Text>
            <Text style={styles.signatureDate}>
              {formatDate(contract.doctor_signed_at) || '—'}
            </Text>
            {doctorSignatureUrl ? (
              <Image
                style={styles.signatureImage}
                src={doctorSignatureUrl}
              />
            ) : (
              <Text
                style={{
                  fontSize: 9,
                  color: '#9ca3af',
                }}
              >
                Not signed
              </Text>
            )}
          </View>

          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>
              Hospital Signature
            </Text>
            <Text style={styles.signatureDate}>
              {formatDate(contract.hospital_signed_at) || '—'}
            </Text>
            {hospitalSignatureUrl ? (
              <Image
                style={styles.signatureImage}
                src={hospitalSignatureUrl}
              />
            ) : (
              <Text
                style={{
                  fontSize: 9,
                  color: '#9ca3af',
                }}
              >
                Not signed
              </Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}
