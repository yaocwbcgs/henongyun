const MAP = {
  种子种苗: '/images/cat-seed.jpg',
  肥料: '/images/cat-fertilizer.jpg',
  农药: '/images/cat-pesticide.jpg',
  农膜农机具: '/images/cat-tool.jpg',
  饲料: '/images/cat-feed.jpg',
  其他: '/images/cat-produce.jpg',
};

export const categoryImage = (category) => MAP[category] || MAP['其他'];
