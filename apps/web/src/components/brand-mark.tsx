import Image from 'next/image';

interface BrandMarkProps {
  readonly prominent?: boolean;
}

interface InstitutionalAffiliationProps {
  readonly inverted?: boolean;
}

export function BrandMark({ prominent = false }: BrandMarkProps) {
  return (
    <div
      className={`brand-mark ${prominent ? 'brand-mark-prominent' : ''}`}
      aria-label="Teknila Siaga Longsor"
    >
      <Image
        src="/brand/logo-teknila.webp"
        alt=""
        width={1563}
        height={1563}
        className="brand-mark-logo"
        priority
      />
    </div>
  );
}

export function InstitutionalAffiliation({ inverted = false }: InstitutionalAffiliationProps) {
  return (
    <div
      className={`institutional-affiliation ${inverted ? 'institutional-affiliation-inverted' : ''}`}
    >
      <Image
        src="/brand/logo-unila.png"
        alt="Logo Universitas Lampung"
        width={48}
        height={48}
        className="institutional-affiliation-logo"
      />
      <span>
        <strong>Universitas Lampung</strong>
        <span>Fakultas Teknik</span>
      </span>
    </div>
  );
}
