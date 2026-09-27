-- Veri düzeltmesi: Places içe aktarımı ilçe/şehri adres yerine kullanıcının
-- aramaya yazdığı metinden alıyordu (çoğu zaman ilçe boş, şehir küçük harfli).
-- Kod düzeltmesi packages/core → parseTurkishAddress; burada mevcut kayıtlar
-- Google adres sonekinden ("… 34513 Esenyurt/İstanbul[, Türkiye]") düzeltilir.
-- Çok parçalı soneklerde ("34520 Beylikdüzü Osb/Beylikdüzü/İstanbul") son iki
-- parça ilçe/şehir kabul edilir.

with parsed as (
  select
    id,
    substring(address from '\m\d{5}\s+(?:[^,/]+/)*([^,/]+?)\s*/\s*[^,/]+?\s*(?:,\s*T[üu]rkiye)?\s*$') as district,
    substring(address from '\m\d{5}\s+(?:[^,/]+/)*[^,/]+?\s*/\s*([^,/]+?)\s*(?:,\s*T[üu]rkiye)?\s*$') as city
  from public.businesses
  where address is not null
)
update public.businesses b
set district = coalesce(p.district, b.district),
    city = coalesce(p.city, b.city),
    updated_at = now()
from parsed p
where p.id = b.id
  and (p.district is not null or p.city is not null)
  and (b.district is distinct from p.district or b.city is distinct from p.city);
