interface SectionLike<K extends string> {
  key: K;
  adminOnly: boolean;
}

/** Temsilciye yöneticiye özel bölümler hiç gösterilmez (yetkiyi yine veritabanı/Edge Function zorlar). */
export function visibleSections<K extends string, S extends SectionLike<K>>(sections: readonly S[], isAdmin: boolean): S[] {
  return sections.filter((section) => isAdmin || !section.adminOnly);
}

/** İstenen bölüm görünür değilse (ör. adres çubuğundan elle yazıldıysa) ilk görünür bölüme düşer. */
export function resolveActiveSection<K extends string>(visible: ReadonlyArray<SectionLike<K>>, requested: string | null): K {
  const match = visible.find((section) => section.key === requested);
  return (match ?? visible[0]!).key;
}
