import { shadcn } from '@clerk/themes';
import type { Theme } from './theme';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
export function makeClerkAppearance(theme: Theme) {
  const d = theme === 'dark';
  const c = d
    ? { primary: '#ddc899', fg: '#ece9dc', muted: '#9fb1a7', bg: '#182a25', input: '#12201c', border: '#2f453d', danger: '#e0867e', btnText: '#173c33' }
    : { primary: '#24483f', fg: '#213a34', muted: '#5f7068', bg: '#fbf9f4', input: '#fffdf9', border: '#d8d5ca', danger: '#a9433d', btnText: '#f9f7f0' };
  const invertIcon = d ? { filter: 'invert(1) brightness(1.2)' } : {};
  return {
    theme: shadcn, cssLayerName: 'clerk',
    options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/${d ? 'logo-dark.svg' : 'logo.svg'}` },
    variables: { colorPrimary: c.primary, colorForeground: c.fg, colorMutedForeground: c.muted, colorDanger: c.danger, colorBackground: c.bg, colorInput: c.input, colorInputForeground: c.fg, colorNeutral: c.border, colorPrimaryForeground: c.btnText, fontFamily: 'DM Sans, sans-serif', borderRadius: '1rem' },
    elements: {
      rootBox: 'w-full flex justify-center',
      cardBox: { width: '440px', maxWidth: '100%', overflow: 'hidden', borderRadius: '1rem', background: c.bg, border: `1px solid ${c.border}` },
      card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: { display: 'none' },
      headerTitle: { color: c.fg, fontWeight: 600 }, headerSubtitle: { color: c.muted },
      socialButtonsBlockButtonText: { color: c.fg }, formFieldLabel: { color: c.fg },
      footerActionLink: { color: c.primary, fontWeight: 600 }, footerActionText: { color: c.muted },
      dividerText: { color: c.muted }, identityPreviewEditButton: { color: c.primary }, formFieldSuccessText: { color: c.primary },
      alertText: { color: c.danger }, logoBox: { display: 'none' }, logoImage: 'max-h-10',
      socialButtonsBlockButton: { borderColor: c.border, background: c.input, borderRadius: '12px' },
      socialButtonsProviderIcon__github: invertIcon, socialButtonsProviderIcon__apple: invertIcon, socialButtonsProviderIcon__x: invertIcon,
      formButtonPrimary: { background: c.primary, color: c.btnText, borderRadius: '12px' },
      formFieldInput: { background: c.input, borderColor: c.border, color: c.fg, borderRadius: '12px' },
      footerAction: 'border-0', dividerLine: { background: c.border },
      alert: { background: d ? '#3a2522' : '#f6e8e4', borderColor: d ? '#5b3732' : '#ecd1cb' },
      otpCodeFieldInput: { borderColor: c.border, color: c.fg, borderRadius: '10px' }, formFieldRow: 'mb-4', main: 'gap-4',
    },
  };
}
