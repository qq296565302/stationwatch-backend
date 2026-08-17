/**
 * 临时工具：解析《2026--值班记录网页版信息统计-汇总表.xlsx》，生成组织架构 + 账号清单 JSON
 * 用法：node scripts-gen-org.js [xlsx路径] [输出路径]
 * 纯一次性工具，非运行时代码。
 */
const ExcelJS = require('exceljs');
const { pinyin } = require('pinyin-pro');

const XLSX = process.argv[2] || 'd:/SGCC Root/供电所值守云平台前端/2026--值班记录网页版信息统计-汇总表.xlsx';
const OUT = process.argv[3] || 'd:/SGCC Root/供电所值守云平台前端/org-data.json';

// 区县缩写：沿用系统种子码（周村 ZCN 避免与淄川 ZC 冲突）
const DISTRICT_ABBR = {
  '张店供电中心': 'ZD',
  '临淄供电中心': 'LZ',
  '淄川供电中心': 'ZC',
  '博山供电中心': 'BS',
  '周村供电中心': 'ZCN',
  '桓台县供电公司': 'HT',
  '高青县供电公司': 'GQ',
  '沂源县供电公司': 'YY',
  '高新供电中心': 'GX',
};

// 全拼（小写无空格）
const fullPinyin = (name) => pinyin(name, { toneType: 'none', type: 'array' }).join('');
// 首字母（大写，type:array 避免返回带空格的 'S Z'）
const initials = (name) => pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('');

// 站名去掉后缀
const stripSuffix = (name) => name.replace(/供电服务站$|供电中心$|供电所$|供电站$|产业园$/, '');

// 姓名分隔符：中文/英文标点 → 空格
const splitNames = (s) => (s || '').replace(/[，,、;；。.：:；]/g, ' ').split(/\s+/).map((x) => x.trim()).filter(Boolean);

// 疑似两个名字无分隔拼接的连续 ≥5 汉字串：按已知映射拆成两人；其余记入待确认
const SUSPICIOUS_SPLITS = { '贾子龙魏念平': ['贾子龙', '魏念平'] };
const looksSuspicious = (n) => /^[\u4e00-\u9fa5]{5,}$/.test(n) && !SUSPICIOUS_SPLITS[n];

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.worksheets[0];

  const rawDistricts = new Map(); // name -> { admins:[], stations:[] }
  for (let rn = 3; rn <= ws.actualRowCount; rn++) {
    const row = ws.getRow(rn);
    const g = (c) => (row.getCell(c).text || '').trim();
    const district = g(2);
    const admin = g(3);
    const station = g(4);
    const sup = g(5).replace(/\s+/g, ''); // 所长名去所有空格（宋 涛 → 宋涛）
    const membersRaw = g(6);
    if (!district && !station) continue;
    if (!rawDistricts.has(district)) rawDistricts.set(district, { admins: splitNames(admin), stations: [] });
    rawDistricts.get(district).stations.push({ station, sup, membersRaw, members: splitNames(membersRaw) });
  }

  const pending = [];
  const usedAbbrs = new Set(); // 站缩写全局唯一，冲突加数字

  const districts = [...rawDistricts.keys()].map((dname) => {
    const raw = rawDistricts.get(dname);
    return {
      name: dname,
      abbr: DISTRICT_ABBR[dname] || initials(stripSuffix(dname)) || dname,
      admins: raw.admins,
      stations: raw.stations.map((s) => {
        const base = stripSuffix(s.station);
        let abbr = initials(base) || base;
        let k = abbr;
        for (let i = 2; usedAbbrs.has(k); i++) k = abbr + i;
        usedAbbrs.add(k);
        return { name: s.station, abbr: k, sup: s.sup, members: s.members, membersRaw: s.membersRaw };
      }),
    };
  });

  // ===== 生成账号 =====
  const accounts = [];
  let adminCount = 0, supCount = 0, officerCount = 0;
  const stationTotal = districts.reduce((n, d) => n + d.stations.length, 0);

  for (const d of districts) {
    // 区县管理员
    for (const adminName of d.admins) {
      accounts.push({
        username: d.abbr.toLowerCase() + fullPinyin(adminName),
        password: `@admin${d.abbr}_95598`,
        realName: adminName,
        role: 'district_admin',
        district: d.name,
        station: null,
        stationAbbr: d.abbr,
      });
      adminCount++;
    }
    // 每站
    for (const s of d.stations) {
      const sup = s.sup;
      if (sup) {
        accounts.push({
          username: s.abbr.toLowerCase() + fullPinyin(sup),
          password: `@${s.abbr}_95598`,
          realName: sup,
          role: 'supervisor',
          district: d.name,
          station: s.name,
          stationAbbr: s.abbr,
        });
        supCount++;
      }
      // 成员（与所长同名 → 跳过；同所重复姓名 → 去重；拼接名 → 按映射拆分）
      const seen = new Set([sup]);
      const seenUsername = new Set();
      const pushMember = (m) => {
        if (seen.has(m)) return; // 去重（含所长兼成员）
        seen.add(m);
        let username = s.abbr.toLowerCase() + fullPinyin(m);
        if (seenUsername.has(username)) { // 同所内同名/同音兜底加序号
          let i = 2;
          while (seenUsername.has(username + i)) i++;
          username += i;
        }
        seenUsername.add(username);
        accounts.push({
          username,
          password: `@${s.abbr}_95598`,
          realName: m,
          role: 'duty_officer',
          district: d.name,
          station: s.name,
          stationAbbr: s.abbr,
        });
        officerCount++;
      };
      for (const m of s.members) {
        if (SUSPICIOUS_SPLITS[m]) { SUSPICIOUS_SPLITS[m].forEach(pushMember); continue; }
        if (looksSuspicious(m)) { pending.push({ district: d.name, station: s.name, name: m, raw: s.membersRaw }); continue; }
        pushMember(m);
      }
    }
  }

  const json = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: '2026--值班记录网页版信息统计-汇总表.xlsx',
      districtCount: districts.length,
      stationCount: stationTotal,
      adminCount,
      supervisorCount: supCount,
      officerCount,
      accountTotal: accounts.length,
      pendingNames: pending,
      note: '密码为默认密码；站长/值班员同所同名去重；所长兼成员只建所长账号；跨所同名各建账号；名字内空格已去除。',
    },
    districts,
    accounts,
  };

  require('fs').writeFileSync(OUT, JSON.stringify(json, null, 2), 'utf8');
  console.log('已生成:', OUT);
  console.log(`区县 ${districts.length} | 供电所 ${stationTotal} | 管理员 ${adminCount} | 所长 ${supCount} | 值班员 ${officerCount} | 账号合计 ${accounts.length}`);
  if (pending.length) {
    console.log('待确认名字（疑似两人拼接，未生成账号）:');
    pending.forEach((p) => console.log(`  - ${p.district} ${p.station}: [${p.name}]`));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
