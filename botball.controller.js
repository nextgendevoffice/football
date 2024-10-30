const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const { sendMessageToTelegram } = require('./sendMsTelegram');

const getMatches = async (req, res) => {
  try {
    const url = "https://dookeela.live/";
    const timeout = 10000;

    const response = await Promise.race([
      axios.get(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);

    const $ = cheerio.load(response.data);

    const leagues = {};

    $('.col-lg-12.mb-5').each((i, element) => {
      const leagueName = $(element).find('.box-header h1').text();
      const leagueImageURL = $(element).find('.box-header img').attr('src');

      const league = {
        name: leagueName,
        image_url: leagueImageURL,
        matches: [],
      };

      $(element).find('.detail').each((j, matchElement) => {
        const dateTime = formatDateTime($(matchElement).find('.match-date, .match-date-live').text());
        const teamLeft = $(matchElement).find('.team-name-left .name').text().trim();
        const teamLeftImage = $(matchElement).find('.team-name-left img').attr('src');
        const teamRight = $(matchElement).find('.team-name-right .name').text().trim();
        const teamRightImage = $(matchElement).find('.team-name-right img').attr('src');
        const score = $(matchElement).find('.vs').text().trim();
        const link = $(matchElement).find('.view-btn a').attr('href');

        // ดึง ID จาก URL
        const matchId = link ? link.split('/').pop() : null;

        const match = {
          id: matchId,
          date_time: dateTime,
          team_left: teamLeft,
          team_left_image: teamLeftImage,
          score: score,
          team_right: teamRight,
          team_right_image: teamRightImage,
          link: link,
        };

        league.matches.push(match);
      });

      leagues[leagueName] = league;
    });

    res.json(leagues);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while fetching the data' });
  }
};

const formatDateTime = (text) => {
  const match = text.match(/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return '';

  const [_, day, month, hour, minute] = match;
  const year = moment().tz('Asia/Bangkok').year();
  const dayOfWeek = getDayOfWeek(`${day}/${month}`);

  // แปลงเวลาเป็น timezone ของไทยและลดลง 1 ชั่วโม
  const dateTime = moment.tz(`${year}-${month}-${day} ${hour}:${minute}`, 'YYYY-MM-DD HH:mm', 'UTC')
    .tz('Asia/Bangkok')
    .subtract(1, 'hours'); // ลดเวลาลง 1 ชั่วโมง

  return `วัน${dayOfWeek}ที่ ${dateTime.format('DD')} ${getThaiMonth(dateTime.format('MM'))} ${dateTime.format('YYYY')} เวลา ${dateTime.format('HH:mm')} น.`;
};

const geth2h = async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://dookeela.live/football/match/${id}`;

    // กำหนด timeout 10 วินาที
    const timeout = 10000;

    const response = await Promise.race([
      axios.get(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);

    const $ = cheerio.load(response.data);

    // หาตาราง H2H
    const table = $('table.table.table-striped.table-hover.mt-5');

    if (!table.length) {
      return res.status(404).json({ error: 'ไม่พบตาราง H2H' });
    }

    // เก็บข้อมูลจากแต่ละแถว
    const h2hData = [];
    table.find('tr').slice(1).each((index, row) => {
      const columns = $(row).find('td');
      if (columns.length === 6) {
        const matchData = {
          รายการ: $(columns[0]).text().trim(),
          วันที่: $(columns[1]).text().trim(),
          ทีมเหย้า: $(columns[2]).text().trim(),
          ประตู: $(columns[3]).text().trim(),
          ทีมเยือน: $(columns[4]).text().trim(),
          ผล: $(columns[5]).find('button').text().trim()
        };
        h2hData.push(matchData);
      }
    });

    res.status(200).json(h2hData);
  } catch (error) {
    console.error('Error fetching H2H data:', error);
    if (error.message === 'Request timeout') {
      res.status(504).json({ error: 'Request timeout after 10 seconds' });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};

const getMatchDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const url = `https://dookeela.live/football/match/${id}`;
    const timeout = 10000;

    const response = await Promise.race([
      axios.get(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);

    const $ = cheerio.load(response.data);

    const matchDetails = {
      overview: getOverview($),
      h2h: getH2H($),
      statistics: getStatistics($),
      standings: getStandings($)
    };

    res.status(200).json(matchDetails);
  } catch (error) {
    console.error('Error fetching match details:', error);
    if (error.message === 'Request timeout') {
      res.status(504).json({ error: 'Request timeout after 10 seconds' });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};

const getOverview = ($) => {
  const overview = {
    date: $('.detail-info .col-md-3:nth-child(1) .main-color').text().trim(),
    league: $('.detail-info .col-md-3:nth-child(2) .main-color').text().trim(),
    venue: $('.detail-info .col-md-3:nth-child(3) .main-color').text().trim(),
    referee: $('.detail-info .col-md-3:nth-child(4) .main-color').text().trim()
  };
  return overview;
};

const getH2H = ($) => {
  const h2hData = [];

  $('.table-striped.table-hover tr').slice(1).each((index, row) => {
    const $cols = $(row).find('td');
    if ($cols.length === 6) {
      h2hData.push({
        competition: $cols.eq(0).text().trim(),
        date: $cols.eq(1).text().trim(),
        homeTeam: $cols.eq(2).text().trim(),
        score: $cols.eq(3).text().trim(),
        awayTeam: $cols.eq(4).text().trim(),
        result: $cols.eq(5).find('button').text().trim()
      });
    }
  });

  return h2hData;
};

const getStatistics = ($) => {
  const stats = [];

  // ดึงข้อมูลจาก progress bar ที่แสดงสถิิ
  $('.detail-card .row').each((index, element) => {
    const $row = $(element);

    // ดึงชื่อสถิติ
    const statName = $row.find('.col-12.text-center').text().trim();
    if (!statName) return;

    // ดึงค่าสถิติจาก progress bar
    const homeValue = $row.find('.col-md-6:first-child b').text().trim() ||
                     $row.find('.progress-bar.bg-danger').attr('aria-valuenow') || '0';

    const awayValue = $row.find('.col-md-6:last-child b').text().trim() ||
                      $row.find('.progress-bar.bg-secondary').attr('aria-valuenow') || '0';

    stats.push({
      name: statName,
      home: homeValue,
      away: awayValue
    });
  });

  return stats;
};

const getStandings = ($) => {
  const standings = [];
  $('.table-striped.table-hover tr').slice(1).each((index, row) => {
    const columns = $(row).find('td');
    if (columns.length === 10) {
      const teamData = {
        position: $(columns[0]).text().trim(),
        team: {
          name: $(columns[1]).find('span').text().trim(),
          logo: $(columns[1]).find('img').attr('src')
        },
        played: $(columns[2]).text().trim(),
        won: $(columns[3]).text().trim(),
        drawn: $(columns[4]).text().trim(),
        lost: $(columns[5]).text().trim(),
        goalsFor: $(columns[6]).text().trim(),
        goalsAgainst: $(columns[7]).text().trim(),
        goalDifference: $(columns[8]).text().trim(),
        points: $(columns[9]).text().trim()
      };
      standings.push(teamData);
    }
  });

  const leagueInfo = {
    name: $('#tab5 .team .name h5').text().trim(),
    logo: $('#tab5 .team img').attr('src')
  };

  const lastUpdatedText = $('#tab5 .col-12:last-child').text().trim();
  const lastUpdatedMatch = lastUpdatedText.match(/\*อัพเดต่าสุด\s*:\s*(.*)/);
  const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1].trim() : 'ไม่พบข้อมูลการอัปเดต';

  return {
    league: leagueInfo,
    standings,
    lastUpdated
  };
};

const getSureBets = async (req, res) => {
  try {
    const url = "https://www.soccer-rating.com/sure-bets";
    const timeout = 10000;

    const response = await Promise.race([
      axios.get(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);

    const $ = cheerio.load(response.data);
    const matches = [];

    // ดึงข้อมูลจากแต่ละแถวในตาราง
    $('tr').each((i, element) => {
      const odds = $(element).find('td:nth-child(2)').text().trim();
      const leagueCode = $(element).find('.liga a').text().trim();
      const leagueFlag = $(element).find('.liga img').attr('src');

      // ดึงข้อมูลทีมและทิศทางการเคลื่อนไหวของราคา
      const matchRow = $(element).find('td:nth-child(4)');
      const homeTeam = matchRow.find('a:first-child').text().trim();
      const awayTeam = matchRow.find('a:last-child').text().trim();
      const priceMovement = matchRow.find('font').text().includes('⬆️') ? 'up' : 'down';

      const confidence = $(element).find('td:nth-child(5)').text().trim();
      const openingOdds = $(element).find('td:nth-child(6)').text().trim();
      const availableOdds = $(element).find('td:nth-child(7)').text().trim();

      // เช็คว่ามีข้อมูลครบไหม
      if(odds && homeTeam && awayTeam) {
        matches.push({
          odds: parseFloat(odds),
          league: {
            code: leagueCode,
            flag: leagueFlag
          },
          match: {
            home: homeTeam,
            away: awayTeam,
            priceMovement
          },
          ratings: {
            confidence: parseInt(confidence),
            openingOdds: parseInt(openingOdds),
            availableOdds: parseInt(availableOdds)
          },
          timestamp: new Date()
        });
      }
    });

    res.json({
      status: 'success',
      count: matches.length,
      data: matches
    });

  } catch (error) {
    console.error('Error fetching sure bets:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// เพิ่มฟังก์ชันกรองข้อมูลตามความมั่นใจ
const getHighConfidenceBets = async (req, res) => {
  try {
    const { minConfidence = 9 } = req.query;
    const allBets = await getSureBets(req, res);

    const highConfidenceBets = allBets.data.filter(bet =>
      bet.ratings.confidence >= parseInt(minConfidence)
    );

    res.json({
      status: 'success',
      count: highConfidenceBets.length,
      data: highConfidenceBets
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// เพิ่มฟังก์ชันสำหรับจัดการวันที่และเวลา

const getDate = (text) => {
  const match = text.match(/(\d{2})\/(\d{2})/);
  if (!match) return '';
  const [_, day, month] = match;
  const year = moment().tz('Asia/Bangkok').year();
  return `${day}/${month}/${year}`;
};

const getTime = (text) => {
  const match = text.match(/(\d{2}):(\d{2})/);
  if (!match) return '';

  // ลดเวลาลง 1 ชั่วโมง
  const [_, hour, minute] = match;
  const adjustedHour = (parseInt(hour) - 1 + 24) % 24; // บวก 24 และ mod 24 เพื่อให้ได้เวลาที่ถูกต้องเมื่อข้ามวัน
  return `${adjustedHour.toString().padStart(2, '0')}:${minute}`;
};

const getDayOfWeek = (text) => {
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const dateMatch = text.match(/(\d{2})\/(\d{2})/);
  if (!dateMatch) return '';

  const [_, day, month] = dateMatch;
  const year = moment().tz('Asia/Bangkok').year();
  const date = moment.tz(`${year}-${month}-${day}`, 'YYYY-MM-DD', 'Asia/Bangkok');
  return days[date.day()];
};

const getThaiMonth = (month) => {
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวคม'
  ];
  return months[parseInt(month) - 1];
};

// ฟังก์ชันสำหรับจัดรูปแบบข้อความ Telegram
const formatTelegramMessage = (match) => {
  return `
🏆 *${match.league}*
⚽️ ${match.homeTeam} vs ${match.awayTeam}

📊 *การวิเคราะห์*
▫️ ความมั่นใจ: ${match.confidence}/10
▫️ อัตราต่อรอง: ${match.odds}

📈 *ข้อมูลอัตราต่อรอง*
▫️ Opening Odds: ${match.openingOddsRating}
▫️ First Move: ${match.firstOddsMove}
▫️ Dropping: ${match.droppingOdds}
▫️ Available Odds: ${match.availableOddsRating}
▫️ Fair Odds: ${match.oddsCalculator}

📋 *สถิติทีม*
▫️ เรตติ้งเจ้าบ้าน: ${match.homeRating}
▫️ เรตติ้งทีมเยือน: ${match.awayRating}
▫️ ฟอร์ม 3 นัดล่าสุด: ${match.formLast3}

💡 *คำแนะนำ*
${getRecommendation(match)}

➖➖➖➖➖➖➖➖➖➖
`;
};

// อัปเดตการส่งข้อความไปยัง Telegram
const sendToTelegram = async (matches) => {
  try {
    for (const match of matches) {
      const message = formatTelegramMessage(match);
      await bot.telegram.sendMessage(
        process.env.TELEGRAM_CHANNEL_ID,
        message,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.error('Error sending to Telegram:', error);
  }
};

// อัปเดตฟังก์ชัน getHighestConfidenceBets
const getHighestConfidenceBets = async (req, res) => {
  try {
    const { minConfidence = 8 } = req.query;
    const url = "https://www.soccer-rating.com/sure-bets";
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const matches = new Map();

    // ดึงข้อมูลแมตช์และหาทีมที่เป็น bold
    $('tr').each((i, element) => {
      const cells = $(element).find('td');
      if (cells.length >= 4) {
        const odds = $(cells[1]).text().trim();
        const leagueCell = $(cells[2]);
        const matchCell = $(cells[3]);
        const confidence = $(cells[4]).text().trim();

        // เพิ่มการดึงข้อมูลใหม่
        const openingOdds = $(cells[5]).text().trim(); // Opening Odds Rating
        const firstOddsMove = $(cells[6]).text().trim(); // First Odds Move
        const droppingOdds = $(cells[7]).text().trim(); // Dropping Odds
        const availableOdds = $(cells[8]).text().trim(); // Available Odds Rating
        const oddsCalculator = $(cells[9]).text().trim(); // Odds Calculator
        const formLast3 = $(cells[10]).text().trim(); // Form Last 3 Games

        // สร้าง object เก็บข้อมูล
        const matchData = {
          odds,
          league: leagueCell.text().trim(),
          match: matchCell.text().trim(),
          confidence: parseFloat(confidence),
          openingOddsRating: openingOdds,
          firstOddsMove: firstOddsMove,
          droppingOdds: droppingOdds, 
          availableOddsRating: availableOdds,
          oddsCalculator: oddsCalculator,
          formLast3: formLast3,
          homeTeam: '',
          awayTeam: '',
          homeRating: 0,
          awayRating: 0
        };

        if (odds && !isNaN(parseFloat(odds))) {
          const leagueCode = leagueCell.find('a').text().trim();
          const leagueFlag = leagueCell.find('img').attr('src');
          const matchTime = leagueCell.find('img').attr('title')?.split(',')[0] || '';

          const homeTeamLink = matchCell.find('a:first-child');
          const awayTeamLink = matchCell.find('a:last-child');

          // สร้าง unique key จากชื่อทีมและเวลาแข่ง
          const matchKey = `${homeTeamLink.text()}_${awayTeamLink.text()}_${matchTime}`;

          // เช็คว่ามีข้อมูลนี้แล้หรือยัง
          if (!matches.has(matchKey)) {
            const match = {
              dateTime: {
                display: formatDateTime(matchTime),
                date: getDate(matchTime),
                time: getTime(matchTime),
                dayOfWeek: getDayOfWeek(matchTime)
              },
              league: {
                name: leagueCode,
                code: leagueCode,
                flag: leagueFlag
              },
              teams: {
                home: {
                  name: homeTeamLink.text().trim(),
                  url: `https://www.soccer-rating.com${homeTeamLink.attr('href')}`
                },
                away: {
                  name: awayTeamLink.text().trim(),
                  url: `https://www.soccer-rating.com${awayTeamLink.attr('href')}`
                }
              },
              odds: {
                current: odds,
                opening: $(cells[5]).text().trim(),
                available: $(cells[6]).text().trim()
              },
              confidence: parseInt(confidence),
              ratings: {}
            };

            // เพิ่มารด betteam จาทีมที่เป็น bold
            const betteam = $(element).find('b').text().trim();
            if (betteam) {
              match.betteam = betteam;
            }

            matches.set(matchKey, match);
          }
        }
      }
    });

    // ดึง ratings แบบขนานโดยใช้ Promise.all
    const matchesArray = Array.from(matches.values());
    const ratingPromises = matchesArray.map(async (match) => {
      try {
        // ดึงข้อมูลเฉพาะจาก URL ของทีมเหย้า
        const homeResponse = await axios.get(match.teams.home.url);
        const $home = cheerio.load(homeResponse.data);

        // ดึง Team Ratings (H/A) จากตาราง
        const getTeamRatings = ($) => {
          const ratings = {};
          $('tr').each((_, row) => {
            const cells = $(row).find('td');
            const label = cells.first().text().trim();
            if (label === 'Team Ratings (H/A)') {
              ratings.home = parseFloat(cells.eq(1).text().trim()) || 0;
              ratings.away = parseFloat(cells.eq(2).text().trim()) || 0;
            }
          });
          return ratings;
        };

        const teamRatings = getTeamRatings($home);

        match.ratings = {
          home: teamRatings,
          away: teamRatings
        };

      } catch (error) {
        console.error(`Error fetching ratings for match ${match.teams.home.name} vs ${match.teams.away.name}:`, error);
        match.ratings = {
          home: { home: 0, away: 0 },
          away: { home: 0, away: 0 }
        };
      }
      return match;
    });

    const updatedMatches = await Promise.all(ratingPromises);

    // กรองและเรียงลำดับในขั้นตอนเดียว
    const matchResults = updatedMatches
      .filter(match => match.confidence >= parseInt(minConfidence))
      .sort((a, b) => b.confidence - a.confidence);

    // ส่งข้อความไปยัง Telegram
    await sendToTelegram(matchResults);

    return {
      status: 'success',
      count: matchResults.length,
      data: matchResults
    };

  } catch (err) {
    console.error('Error in getHighestConfidenceBets:', err);
    throw err;
  }
};

// เพิ่มค่าคงที่สำหรับ Telegram
const TELEGRAM_BOT_TOKEN = '8036415607:AAEsh8Cm_TjiWWp04JICN8k39Kl5MxWrwnw';
const TELEGRAM_CHAT_ID = '-4553435000';

// เพิ่มฟังก์ชันสำหรับจัดรูปแบบข้อความ
const formatMatchMessage = (match) => {
  const { dateTime, teams, confidence, ratings, betteam, odds } = match;

  // สร้างลูกศรตามค่า rating
  const homeRating = ratings.home?.home || 0;
  const awayRating = ratings.away?.away || 0;
  const homeArrow = homeRating > awayRating ? '🟢' : '🔴';
  const awayArrow = awayRating > homeRating ? '🟢' : '🔴';

  return `
📅 ${dateTime.display}

⚔️ *การแข่งขัน*
${teams.home.name} ${homeArrow} vs ${teams.away.name} ${awayArrow}

📊 *การวิเคราะห์*
▫️ ความมั่นใจ: ${confidence}/10
▫️ ทีมแนะนำ: ${betteam}

📈 *ข้อมูลอัตราต่อรอง*
▫️ ราคาปัจจุบัน: ${odds.current}
▫️ Opening Odds: ${odds.opening}
▫️ Available Odds: ${odds.available}

📋 *สถิติทีม*
▫️ เรตติ้งเจ้าบ้าน: ${homeRating}
▫️ เรตติ้งทีมเยือน: ${awayRating}

💡 *คำแนะนำ*
${getRecommendation(confidence)}

➖➖➖➖➖➖➖➖➖➖
`;
};

// ฟังก์ชันสำหรับสร้างคำแนะนำ
const getRecommendation = (confidence) => {
  if (confidence >= 8) {
    return "⭐️ แนะนำให้เดิมพัน - ความมั่นใจสูง";
  } else if (confidence >= 6) {
    return "⚠️ พิจารณาตามความเหมาะสม";
  } else {
    return "❌ ไม่แนะนำให้เดิมพัน - ความเสี่ยงสูง";
  }
};

// เพิ่มฟังก์ชันสำหรับ polling
const startPolling = async () => {
  let offset = 0;

  const pollTelegram = async () => {
    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`,
        {
          params: {
            offset,
            timeout: 30
          }
        }
      );

      const updates = response.data.result;

      for (const update of updates) {
        offset = update.update_id + 1;

        if (update.message && update.message.text) {
          const text = update.message.text;

          // ตรวจสอบคำสั่ง /ทีเด็ด
          if (text.startsWith('/ทีเด็ด')) {
            const confidence = parseInt(text.split(' ')[1]) || 8;

            // เรียกใช้ฟังก์ชันดึงข้อมูล
            const matches = await getHighestConfidenceBets(
              { query: { minConfidence: confidence } },
              { json: (data) => data }
            );

            if (!matches.data || matches.data.length === 0) {
              await sendMessageToTelegram(
                TELEGRAM_BOT_TOKEN,
                TELEGRAM_CHAT_ID,
                '❌ ไม่พบทีเด็ดที่ตรงตามเงื่อนไข'
              );
              continue;
            }

            // สร้างข้อความตอบกลับ
            let message = `🏆 ทีเด็ดบอลวันนี้ (ความมั่นใจ ${confidence}+)\n`;
            message += `พบทั้งหมด ${matches.data.length} คู่\n`;
            message += '──────────────\n';

            matches.data.forEach(match => {
              message += formatMatchMessage(match);
            });

            await sendMessageToTelegram(
              TELEGRAM_BOT_TOKEN,
              TELEGRAM_CHAT_ID,
              message
            );
          }
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }

    // ทำ polling ต่อไปเรื่อยๆ
    setTimeout(pollTelegram, 1000);
  };

  // เริ่ม polling
  pollTelegram();
};

// เริ่ม polling เมื่อเริ่มต้นแอพ
startPolling();

module.exports = {
  getMatches,
  geth2h,
  getStandings,
  getMatchDetails,
  getSureBets,
  getHighConfidenceBets,
  getHighestConfidenceBets,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID
};
