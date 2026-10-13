import { parseStationRows } from './stations-import';

const HEADER =
  'company,station_number,name,locality,municipality,status,status_note,ownership_as_written,supervisor_name,supervisor_phone,operator_name,operator_phone,petrol_95,diesel,kerosene,source,check_note';

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');

describe('parseStationRows', () => {
  it('maps the columns of one row', () => {
    const { rows, errors } = parseStationRows(
      csv('شركة أ,10,محطة,حي,سبها,SUSPENDED_OWNER,متوقفة,خاصة,مشرف,0912345678,مشغل,0925000000,yes,no,no,src,'),
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      company: 'شركة أ',
      stationNumber: '10',
      name: 'محطة',
      locality: 'حي',
      status: 'SUSPENDED_OWNER',
      statusNote: 'متوقفة',
      supervisorPhone: '0912345678',
      operatorPhone: '0925000000',
      fuel: { PETROL_95: true, DIESEL: false, KEROSENE: false },
      checkNote: null,
    });
  });

  it('ignores the ownership column: it is not used by the system', () => {
    const { rows, warnings, errors } = parseStationRows(csv('شركة أ,10,محطة,,سبها,ACTIVE,,مملوكة,,,,,,,,src,'));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(rows[0]).not.toHaveProperty('ownershipType');
  });

  it('keeps unknown fuel cells unset instead of guessing', () => {
    const { rows } = parseStationRows(csv('شركة أ,10,محطة,,سبها,ACTIVE,,,,,,,,,,src,'));
    expect(rows[0]!.fuel).toEqual({});
  });

  it('keeps check notes with the row', () => {
    const { rows } = parseStationRows(csv('شركة أ,10,محطة,,سبها,ACTIVE,,,,,,,,,,src,"CONFIRM: a, b"'));
    expect(rows[0]!.checkNote).toBe('CONFIRM: a, b');
  });

  it('drops a phone that is not a Libyan mobile instead of storing it', () => {
    const { rows, warnings } = parseStationRows(csv('شركة أ,10,محطة,,سبها,ACTIVE,,,مشرف,091980800,,,,,,src,'));
    expect(rows[0]!.supervisorPhone).toBeNull();
    expect(warnings.join('\n')).toContain('supervisor phone');
  });

  it('refuses the same company and number twice, but allows one number in two companies', () => {
    const twice = parseStationRows(
      csv('شركة أ,10,محطة,,سبها,ACTIVE,,,,,,,,,,s,', 'شركة أ,10,محطة ثانية,,سبها,ACTIVE,,,,,,,,,,s,'),
    );
    expect(twice.errors.join('\n')).toContain('appears twice');
    const twoCompanies = parseStationRows(
      csv('شركة أ,408,محطة,,سبها,ACTIVE,,,,,,,,,,s,', 'شركة ب,408,محطة,,سبها,ACTIVE,,,,,,,,,,s,'),
    );
    expect(twoCompanies.errors).toEqual([]);
    expect(twoCompanies.rows).toHaveLength(2);
  });

  it('refuses a municipality other than سبها, an unknown status and missing required cells', () => {
    expect(parseStationRows(csv('شركة أ,10,محطة,,مرزق,ACTIVE,,,,,,,,,,s,')).errors.join()).toContain('مرزق');
    expect(parseStationRows(csv('شركة أ,10,محطة,,سبها,BROKEN,,,,,,,,,,s,')).errors.join()).toContain('BROKEN');
    expect(parseStationRows(csv(',10,محطة,,سبها,ACTIVE,,,,,,,,,,s,')).errors.join()).toContain('required');
  });

  it('defaults a blank status to ACTIVE and a blank municipality to سبها', () => {
    const { rows, errors } = parseStationRows(csv('شركة أ,10,محطة,,,,,,,,,,,,,s,'));
    expect(errors).toEqual([]);
    expect(rows[0]!.status).toBe('ACTIVE');
  });
});
