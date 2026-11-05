import { getDb } from '../db/index.js';
import { hashPassword } from '../lib/security.js';
import { logger } from '../lib/logger.js';

const DEMO_PASSWORD = 'Demo@12345';
const ADMIN_PASSWORD = 'Admin@12345';

const USERS = [
  { key: 'admin', email: 'admin@henongyun.cn', name: '平台管理员', role: 'admin', password: ADMIN_PASSWORD },
  { key: 'agronomist', email: 'agri@henongyun.cn', name: '陈农艺（农技员）', role: 'agronomist', password: ADMIN_PASSWORD },
  { key: 'merchant', email: 'merchant@demo.henongyun.local', name: '周建国', role: 'merchant', password: DEMO_PASSWORD },
  { key: 'merchant2', email: 'merchant2@demo.henongyun.local', name: '李秀兰', role: 'merchant', password: DEMO_PASSWORD },
  { key: 'farmer', email: 'farmer@demo.henongyun.local', name: '王春生', role: 'user', password: DEMO_PASSWORD },
  { key: 'buyer', email: 'buyer@demo.henongyun.local', name: '赵晓雨', role: 'user', password: DEMO_PASSWORD },
];

const KNOWLEDGE = [
  {
    slug: 'tomato-early-blight',
    title: '番茄早疫病：识别要点与田间管理',
    crop: '番茄',
    category: '真菌性病害',
    summary: '早疫病在番茄叶片上形成同心轮纹状褐斑，高湿条件下扩展迅速。本文说明识别要点、易发条件与以农业防治为基础的处理思路。',
    symptoms:
      '叶片初现水浸状小点，扩大为褐色圆形或近圆形病斑，边缘深褐、中央灰褐，具明显同心轮纹；湿度大时病斑上可见黑色霉层。茎部病斑多为椭圆形凹陷褐斑，果实多在果蒂附近发病。',
    conditions: '适宜发病温度 20—28℃，相对湿度持续高于 80% 时扩展快；连作、密植、通风不良、氮肥偏多的田块发病更重。',
    content: `## 识别要点
早疫病最直观的特征是**病斑上的同心轮纹**。与晚疫病相比，早疫病病斑边界较清晰、质地偏干，晚疫病则多呈水浸状、边缘不明显并快速扩大。发现病斑时应同时观察叶背与茎部，避免只凭单叶判断。

## 易发条件
- 温度 20—28℃、连续阴雨或棚内高湿；
- 连作地块、种植过密、下部叶片长期郁闭；
- 偏施氮肥导致植株徒长、抗性下降。

## 田间管理建议
1. **清除初侵染源**：及时摘除下部病叶、病果，带出田外集中处理，不要随手丢在畦沟。
2. **改善通风**：棚室注意放风排湿，露地合理密植，避免大水漫灌。
3. **平衡施肥**：增施有机肥与磷钾肥，控制氮肥用量，提高植株抗性。
4. **轮作**：与非茄科作物轮作 2 年以上可显著降低菌源基数。

## 关于药剂
是否需要用药、用什么药、用多大剂量，必须依据**当地植保部门发布的防治意见**与**农药登记标签**确定。不同地区抗药性状况不同，平台不提供统一配比。建议把病叶照片与田间情况提交农技咨询，由农技人员结合当地实际给出方案。

## 适用条件与局限
本文适用于露地与棚室番茄的常规识别参考，不能替代实验室病原鉴定。若出现大面积急性萎蔫或快速蔓延，应第一时间联系当地植保站。`,
    sourceName: '全国农技推广服务中心公开技术资料（平台农技编辑整理）',
    sourceUrl: 'https://www.natesc.org.cn',
  },
  {
    slug: 'cucumber-downy-mildew',
    title: '黄瓜霜霉病：从叶背霉层判断与降湿管理',
    crop: '黄瓜',
    category: '真菌性病害',
    summary: '霜霉病是黄瓜棚室的高发病害，叶背灰黑色霉层是关键识别点。本文梳理判断方法、与角斑病的区别及以控湿为核心的防治思路。',
    symptoms:
      '叶片正面出现淡黄色多角形病斑，受叶脉限制；湿度大时叶背对应位置长出灰黑色霉层。病斑由下部叶片向上扩展，严重时叶片干枯但多仍附着于茎蔓。',
    conditions: '发病适温 16—24℃，叶面结露时间长、棚内相对湿度大于 85% 时流行最快；昼夜温差大、通风不足的棚室风险高。',
    content: `## 与细菌性角斑病的区别
霜霉病病斑受叶脉限制呈**多角形**，叶背有**灰黑色霉层**；角斑病病斑同样多角，但叶背潮湿时溢出的是**乳白色菌脓**，干后呈一层白膜，且病斑易穿孔。两者用药方向完全不同，判断错误会导致防治无效。

## 控湿是第一位的
霜霉病的孢子囊在叶面有水膜时才能萌发。把夜间棚内湿度降下来，比反复用药更有效：
- 采用膜下滴灌，避免大水漫灌；
- 上午升温后及时放风排湿，下午提早闭棚保温；
- 合理密植，及时打掉下部老叶、病叶，改善通风；
- 避免傍晚喷水，减少叶面结露时间。

## 农业防治
与非瓜类作物轮作；选用抗病品种；增施腐熟有机肥，避免偏施氮肥；发现中心病株后及时摘除病叶并带出棚外。

## 药剂使用
请在**当地植保部门指导下**选择在黄瓜上登记的药剂，严格按照标签剂量与安全间隔期使用，并注意轮换作用机理不同的药剂以延缓抗性。平台不提供具体配比。

## 适用条件
本文适用于保护地与露地黄瓜的识别参考。若棚内已出现大面积枯叶，建议同时检测是否混合感染细菌性角斑病。`,
    sourceName: '全国农技推广服务中心公开技术资料（平台农技编辑整理）',
    sourceUrl: 'https://www.natesc.org.cn',
  },
  {
    slug: 'wheat-stripe-rust',
    title: '小麦条锈病：春季巡查的三个关键动作',
    crop: '小麦',
    category: '真菌性病害',
    summary: '条锈病孢子随气流远距离传播，春季是监测关键期。本文说明“一看叶脉、二看颜色、三看排列”的田间判断方法。',
    symptoms:
      '叶片上出现鲜黄色至橙黄色、沿叶脉排列成条状的夏孢子堆，用手触摸有黄色粉末附着；发病后期病斑破裂、叶片干枯。',
    conditions: '春季气温回升至 9—16℃、田间湿度较高时扩展快；越夏菌源区与风力传播路径上的田块需重点巡查。',
    content: `## 田间判断三步
1. **看叶脉**：条锈病的孢子堆沿叶脉**纵向排列成行**，这是与叶锈病（散乱分布、颜色偏褐）最直观的区别。
2. **看颜色与触感**：鲜黄色至橙黄色，手指轻擦会沾上黄色粉末。
3. **看分布**：先从下部叶片或田块迎风面出现，形成明显的发病中心。

## 春季巡查建议
- 返青至拔节期每 5—7 天巡查一次，重点看低洼、郁闭、偏施氮肥的地块；
- 发现发病中心立即标记，扩大调查范围；
- 记录发病中心位置与面积，便于后续跟踪。

## 防治原则
条锈病流行速度快，防治强调**“发现一点、防治一片”**。具体用药品种、剂量与时机须遵循**当地植保站发布的防治警报**，不同区域所用药剂与抗性状况差异较大。

## 适用条件
本文为识别与巡查方法参考，不构成用药方案。品种抗性、菌源量和天气条件共同决定是否流行，需结合当地预报综合判断。`,
    sourceName: '全国农技推广服务中心公开技术资料（平台农技编辑整理）',
    sourceUrl: 'https://www.natesc.org.cn',
  },
  {
    slug: 'rice-blast',
    title: '水稻稻瘟病：叶瘟与穗颈瘟的判断差异',
    crop: '水稻',
    category: '真菌性病害',
    summary: '叶瘟与穗颈瘟的危害后果差别很大。本文说明两类症状的判断要点，以及破口期为什么是防治关键窗口。',
    symptoms:
      '叶瘟为梭形病斑，中央灰白、边缘褐色，外围有黄色晕圈；穗颈瘟在穗颈处形成褐色至黑褐色病斑，导致白穗、秕谷，严重时整穗枯死。',
    conditions: '气温 20—28℃、相对湿度大于 90%、日照不足时易发；偏施氮肥、密植、长期深水灌溉的田块发病重。',
    content: `## 叶瘟与穗颈瘟
叶瘟的病斑呈典型**梭形**，两端尖、中央灰白，湿度大时病斑背面有灰绿色霉层。穗颈瘟发生在穗颈节，形成褐色缢缩病斑，输导组织被破坏后出现**白穗**——此时再防治已基本无效。

## 关键窗口期
穗颈瘟的防治关键在**破口前 3—5 天**（约抽穗前）。这个窗口一旦错过，病菌侵入穗颈后药剂难以发挥作用。因此抽穗期的天气预判比发病后的补救更重要：若破口期遇连续阴雨、气温偏低，应提前做好防治准备。

## 农业防治
- 选用抗病品种，注意品种抗性会随种植年限退化；
- 合理密植，避免偏施、迟施氮肥；
- 浅水勤灌、适时晒田，降低田间湿度；
- 病稻草不还田或充分腐熟后再用。

## 用药说明
稻瘟病的用药品种与剂量需依据**当地植保站技术意见**和**农药登记标签**，并注意穗期用药的安全间隔期。平台不提供统一配方。

## 适用条件
本文适用于常规水稻种植区的识别参考。品种抗性差异较大，同一症状在不同品种上的表现可能不同。`,
    sourceName: '全国农技推广服务中心公开技术资料（平台农技编辑整理）',
    sourceUrl: 'https://www.natesc.org.cn',
  },
  {
    slug: 'citrus-huanglongbing',
    title: '柑橘黄龙病：为什么不能只靠打药',
    crop: '柑橘',
    category: '细菌性病害',
    summary: '黄龙病由木虱传播，目前没有有效治疗药剂。本文说明识别特征、传播途径与“三板斧”综合防控逻辑。',
    symptoms:
      '叶片斑驳黄化（黄绿相间、不对称），新梢叶片均匀黄化；果实小而畸变、着色不均（红鼻果），种子败育；病树根系腐烂，整体衰退。',
    conditions: '由柑橘木虱传播，带病苗木和接穗是远距离传播的主要途径；高温多雨、木虱发生量大的产区风险高。',
    content: `## 识别要点
黄龙病的黄化与缺素黄化容易混淆，关键区别在于：黄龙病叶片呈**斑驳状、不对称黄化**，黄绿交界模糊；缺素黄化通常对称、部位规律。果实出现**红鼻果**（果蒂附近先转色、其余仍青）是重要参考。

## 为什么不能只靠打药
黄龙病由韧皮部杆菌引起，目前**没有可治愈的药剂**。田间喷药的作用是**控制传播媒介柑橘木虱**，而不是治疗病树。把打药当成治疗手段，会延误清除病树的最佳时机。

## 综合防控“三板斧”
1. **使用无病苗木**：从有资质的苗圃购买，索取检疫证明，不用来源不明的接穗。
2. **防控木虱**：统一时期、连片防治，重点在新梢期；注意轮换药剂。
3. **及时清除病树**：确诊后先喷药杀灭树上木虱，再挖除病树，避免带毒木虱扩散到邻园。

## 适用条件
本文为识别与防控原则说明，不能替代植物检疫机构的诊断。疑似病树应报告当地植物检疫或农技部门，由专业人员确认后处理。`,
    sourceName: '全国农业技术推广服务中心柑橘黄龙病防控技术资料（平台农技编辑整理）',
    sourceUrl: 'https://www.natesc.org.cn',
  },
  {
    slug: 'apple-valley-spot',
    title: '苹果腐烂病：刮治与树势管理',
    crop: '苹果',
    category: '真菌性病害',
    summary: '腐烂病是苹果枝干的重要病害，伤口和冻害是主要侵入口。本文说明病斑识别、刮治要点与树势恢复思路。',
    symptoms:
      '枝干出现红褐色、水浸状病斑，略隆起，按压有酒糟味；后期病斑干缩凹陷、表面产生黑色小点，皮层腐烂易剥离，严重时环绕枝干导致上部枯死。',
    conditions: '以菌丝体和分生孢子器在病组织中越冬，伤口、冻伤、日灼伤是主要侵染途径；树势衰弱、负载过量、偏施氮肥的果园发病重。',
    content: `## 病斑识别
春季是腐烂病显现的高峰期。典型病斑呈**红褐色、水浸状、略隆起**，用刀削开皮层可见内部组织变褐、有酒糟气味。病斑边缘与健康组织界限明显，后期干缩凹陷并产生黑色小点。

## 刮治要点
1. 用锋利刮刀将病斑连同**边缘 0.5—1 厘米健康组织**一并刮除，刮口呈梭形、平滑，利于愈合；
2. 刮下的病皮集中带出果园销毁，不要留在树盘；
3. 刮治后及时涂药保护伤口，药剂选择遵循**当地植保部门指导与登记标签**；
4. 刮治工具在病树与健康树之间要消毒，避免人为传播。

## 树势管理是根本
腐烂病是典型的“弱树病”。合理负载、平衡施肥、秋季控水促成熟、冬季树干涂白防冻，能显著降低发病率。环剥过重、连年高产、土壤板结的果园往往反复发病。

## 适用条件
本文适用于苹果主产区的枝干病害识别参考。刮治操作建议由有经验的果农或技术人员完成，刮治过深伤及木质部会影响愈合。`,
    sourceName: '全国农技推广服务中心公开技术资料（平台农技编辑整理）',
    sourceUrl: 'https://www.natesc.org.cn',
  },
];

export function seed() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (existing > 0) {
    logger.info('seed.skipped', { reason: 'users exist' });
    return { skipped: true };
  }

  const ids = {};
  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, name, role, region, bio) VALUES (?,?,?,?,?,?)',
  );

  db.transaction(() => {
    for (const u of USERS) {
      const info = insertUser.run(
        u.email,
        hashPassword(u.password),
        u.name,
        u.role,
        u.role === 'merchant' ? '山东省潍坊市' : '山东省',
        u.role === 'agronomist' ? '县级农技推广站工作 12 年，主要负责蔬菜与粮食作物病虫害诊断。' : null,
      );
      ids[u.key] = Number(info.lastInsertRowid);
    }

    db.prepare(
      `INSERT INTO merchant_profiles (user_id, shop_name, contact_name, contact_phone, region, business_type, license_no, intro, status, reviewed_by, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?, 'approved', ?, datetime('now','localtime'))`,
    ).run(ids.merchant, '建国家庭农场（演示）', '周建国', '13800000001', '山东省潍坊市寿光市', '合作社', 'DEMO-LIC-0001', '自有蔬菜基地 120 亩，主营番茄、黄瓜订单供应。', ids.admin);
    db.prepare(
      `INSERT INTO merchant_profiles (user_id, shop_name, contact_name, contact_phone, region, business_type, license_no, intro, status, reviewed_by, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?, 'approved', ?, datetime('now','localtime'))`,
    ).run(ids.merchant2, '秀兰农资服务部（演示）', '李秀兰', '13800000002', '山东省潍坊市青州市', '农资经销', 'DEMO-LIC-0002', '经营种子、肥料与植保器械，提供本地配送与用药咨询。', ids.admin);

    for (const a of KNOWLEDGE) {
      db.prepare(
        `INSERT INTO knowledge_articles (slug, title, crop, category, summary, content, symptoms, conditions, source_name, source_url, status, reviewed_by, reviewed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'published', ?, datetime('now','localtime'))`,
      ).run(a.slug, a.title, a.crop, a.category, a.summary, a.content, a.symptoms, a.conditions, a.sourceName, a.sourceUrl, ids.agronomist);
    }

    const sources = [
      { code: 'manual-natesc', name: '全国农产品批发市场价格（人工录入）', kind: 'manual', url: 'https://www.natesc.org.cn', note: '由平台运营人员依据公开行情信息录入，逐条审核后展示。' },
      { code: 'partner-api', name: '合作行情数据接口', kind: 'api', url: '', note: '需在环境变量中配置 MARKET_API_URL 与 MARKET_API_KEY 后方可采集。' },
    ];
    for (const s of sources) {
      db.prepare('INSERT INTO market_sources (code, name, kind, url, note) VALUES (?,?,?,?,?)').run(s.code, s.name, s.kind, s.url || null, s.note);
    }

    // 演示业务数据：所有店铺名与说明均带“演示”标识，生产部署请设置 DEMO_SEED=false
    const tomorrow = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const posts = [
      ['supply', ids.merchant, '寿光硬粉番茄 精品级 大批量供应', '蔬菜', '硬粉番茄', '单果 180-220g，精品级', 30, '吨', 'fixed', 4.2, '山东省', '潍坊市', '基地直供，可提供农残检测报告，支持实地看货。', 'active'],
      ['supply', ids.merchant, '大棚黄瓜 次日采摘 冷链直发', '蔬菜', '密刺黄瓜', '长度 30-35cm', 12, '吨', 'negotiable', null, '山东省', '潍坊市', '每日凌晨采摘，当日冷链发出，适合商超与团购渠道。', 'active'],
      ['demand', ids.buyer, '求购优质小麦 容重 770 以上', '粮食', '济麦22', '容重≥770g/L，水分≤12.5%', 500, '吨', 'fixed', 2.65, '山东省', '济南市', '用于面粉加工，需提供质检报告，可长期合作。', 'active'],
      ['demand', ids.buyer, '长期采购苹果 80# 以上 分级包装', '水果', '红富士', '80# 以上，一级果', 200, '吨', 'negotiable', null, '山东省', '烟台市', '要求分级包装、无碰压伤，按月分批供货。', 'active'],
      ['supply', ids.merchant2, '优质复合肥 15-15-15 厂家直发', '其他', '复合肥', '40kg/袋', 800, '件', 'fixed', 128, '山东省', '潍坊市', '正规厂家货源，可提供检测报告，支持县域配送。', 'active'],
      ['demand', ids.farmer, '求购玉米种子 郑单958', '粮食', '玉米种子', '4000 粒/袋', 300, '件', 'negotiable', null, '山东省', '德州市', '需要正规包装与检疫证明，春播前到货。', 'active'],
    ];
    const insertPost = db.prepare(
      `INSERT INTO posts (type, user_id, title, category, variety, spec, quantity, unit, price_type, price, province, city, valid_until, description, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime', ?))`,
    );
    posts.forEach((p, i) => {
      insertPost.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], tomorrow, p[12], p[13], `-${i + 1} hours`);
    });

    const products = [
      [ids.merchant2, '番茄专用水溶肥 平衡型', '肥料', '5kg/袋', '袋', 68, 120, '适用于番茄结果期追施，含微量元素。', '番茄、辣椒等茄果类', '生产企业：示例肥料有限公司（演示数据）；登记证号以包装标示为准。'],
      [ids.merchant2, '黄瓜种子 津优35号', '种子种苗', '1000 粒/袋', '袋', 45, 200, '耐低温弱光，适合越冬茬与早春茬栽培。', '保护地黄瓜', '种子来源：示例种业（演示数据）；发芽率以包装检测报告为准。'],
      [ids.merchant2, '苦参碱杀虫剂 0.3%', '农药', '500ml/瓶', '瓶', 32, 80, '用于防治蚜虫等害虫，按标签使用。', '蔬菜、果树', '登记作物与用量以农药标签为准；演示数据。'],
      [ids.merchant2, '大棚PO膜 长寿无滴', '农膜农机具', '12m×30m', '卷', 980, 20, '透光率高，流滴持效期长，适合日光温室。', '日光温室、大棚', '生产厂家：示例塑业（演示数据）。'],
      [ids.merchant, '精品硬粉番茄 5kg 装', '其他', '5kg/箱', '箱', 39.9, 150, '基地当日采摘，适合家庭与社区团购。', '生鲜配送', '产地：山东寿光（演示数据）。'],
      [ids.merchant2, '有机肥 羊粪发酵 40kg', '肥料', '40kg/袋', '袋', 42, 300, '充分腐熟，适合果蔬基肥使用。', '果树、蔬菜', '生产企业：示例有机肥厂（演示数据）。'],
      [ids.merchant2, '电动喷雾器 16L', '农膜农机具', '16L 锂电', '台', 268, 40, '双泵加压，适合大棚与果园植保作业。', '设施农业', '品牌：示例农机具（演示数据）。'],
      [ids.merchant, '水果黄瓜 2.5kg 装', '其他', '2.5kg/箱', '箱', 29.9, 60, '脆嫩清甜，冷链发货。', '生鲜配送', '产地：山东寿光（演示数据）。'],
    ];
    const insertProduct = db.prepare(
      `INSERT INTO products (merchant_id, name, category, spec, unit, price, stock, description, applicable, source_note, status)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'active')`,
    );
    for (const p of products) insertProduct.run(...p);

    const machinery = [
      [ids.merchant, '久保田 PRO688Q 联合收割机', '收割机', '久保田', 'PRO688Q', '68 马力', '山东省', '潍坊市', '潍坊市全域，跨区需提前 3 天预约', 'per_mu', 65, '带秸秆粉碎还田装置，适合小麦、水稻收割。车况良好，机手 8 年经验。'],
      [ids.merchant, '大疆 T50 植保无人机', '植保无人机', '大疆', 'T50', '50L 药箱', '山东省', '潍坊市', '寿光、青州周边 50 公里', 'per_mu', 8, '喷洒均匀，适合大田与设施周边作业，含飞手服务。'],
      [ids.merchant, '东方红 LX904 拖拉机', '拖拉机', '东方红', 'LX904', '90 马力', '山东省', '潍坊市', '潍坊市及周边县市', 'per_hour', 220, '可配套旋耕、深松、运输作业。'],
      [ids.merchant2, '沃得 4LZ-5 水稻收割机', '收割机', '沃得', '4LZ-5', '110 马力', '山东省', '潍坊市', '青州、临朐水稻种植区', 'per_mu', 70, '履带式底盘，烂泥田适应性强。'],
    ];
    const insertMachine = db.prepare(
      `INSERT INTO machinery (merchant_id, name, type, brand, model, power, province, city, service_area, pricing_type, price, description, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active')`,
    );
    for (const m of machinery) insertMachine.run(...m);

    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'system', '欢迎使用禾农云', '这是演示数据集：所有店铺与商品均标注“演示”，可在生产环境通过 DEMO_SEED=false 关闭。', '/')`,
    ).run(ids.farmer);
  })();

  logger.info('seed.done', { users: USERS.length, knowledge: KNOWLEDGE.length });
  return { skipped: false, users: USERS, demoPassword: DEMO_PASSWORD, adminPassword: ADMIN_PASSWORD };
}
