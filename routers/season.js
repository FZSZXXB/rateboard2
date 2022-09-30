let express = require('express');
let url = require("url");
let fs = require("fs");
let path = require("path");
let { pinyin } = require("pinyin");
let { kill } = require('process');
//路由对象
let router = express.Router();

//中间件,未登录不能访问发表文章页面
async function checklogin(req, res, next) {
	if (req.user) {
		next();
	} else {
		res.redirect('/sport/loginPage');
	}
}

router.get('/:id', async (req, res) => {
	try {
		let id = parseInt(req.params.id);

		let seasons = await myQuery(`SELECT * FROM season WHERE id = ?`, [id]);

		if (seasons.length == 0) throw '赛季不存在';

		let season = seasons[0];
		console.log(season);
		if (req.query.dataOnly) {
			let contests =
				await myQuery(`SELECT * FROM contest WHERE season = ? ORDER BY contest.time DESC`, [id]);
			await contests.mapAsync(async x => x.time = web_util.formatDate(x.time));
			res.json({
				content: season.content,
				contests: contests
			});
		} else {
			res.render('season', {
				season: season
			});
		}
	} catch (e) {
		console.warn(e);
		res.render('error', { error: e });
	}
})

router.get('/:id/edit', checklogin, async (req, res) => {
	try {
		let id = parseInt(req.params.id);
		let user = req.user;
		let seasons = await myQuery(`SELECT * FROM season WHERE id = ?`, [id]);
		if (seasons.length == 0) {
			let tmp = web_util.getCurrentDate();
			let nowTime = web_util.formatDate(tmp);
			let newseason = { 'id': 0, 'title': '', 'content': '', 'start_time': nowTime, 'end_time': nowTime };
			res.render('season_edit', {
				season: newseason
			})
		} else {
			let season = seasons[0];
			season.start_time = web_util.formatDate(season.start_time);
			season.end_time = web_util.formatDate(season.end_time);
			res.render('season_edit', {
				season: season
			})
		}
	} catch (e) {
		console.warn(e);
		res.render('error', { error: e });
	}
})

router.post('/:id/edit', async (req, res) => {
	try {
		res.setHeader('Content-Type', 'application/json');
		let user = req.user;
		if (!user)
			throw 3001; // 未经授权
		else {
			let id = parseInt(req.params.id);
			console.log("id = " + id);
			let season = req.body;
			if (!season.title) throw 3002; // 标题无效

			season.start_time = web_util.parseDate(season.start_time);
			season.end_time = web_util.parseDate(season.end_time);

			let seasons = await myQuery(`SELECT * FROM season WHERE id = ?`, [id]);

			if (seasons.length == 0) {
				let season_id = await myInsert(
					`INSERT INTO season(title, content, start_time, end_time) VALUES(?,?,?,?)`, [
					season.title, season.content, season.start_time, season.end_time
				]);
				res.send(JSON.stringify({ error_code: 1, season_id: season_id }));
			} else {
				await myQuery(
					`UPDATE season SET title=?,content=?,start_time=?,end_time=? WHERE id=?`, [
					season.title, season.content, season.start_time, season.end_time, id
				]);
				res.send(JSON.stringify({ error_code: 1, season_id: id }));
			}
		}
	} catch (e) {
		res.send(JSON.stringify({ error_code: e, detail: e.message }));
	}
})

router.get('/:sid/ranking/:rid', async (req, res) => {
	try {
		let rid = parseInt(req.params.rid);
		res.setHeader('Content-Type', 'application/json');
		let rankings = await myQuery(`SELECT * FROM ranking WHERE id = ?`, [rid]);

		if (rankings.length == 0) throw 1001;
		res.json({
			data: rankings[0].data
		});
	} catch (e) {
		console.warn(e.message);
		res.send(JSON.stringify({ error: e }))
	}
})

router.get('/:sid/contest/:cid/edit', checklogin, async (req, res) => {
	try {
		let sid = parseInt(req.params.sid);
		let cid = parseInt(req.params.cid);
		let user = req.user;
		let seasons = await myQuery(`SELECT * FROM season WHERE id = ?`, [sid]);

		if (seasons.length == 0) {
			throw '赛季不存在';
		} else {
			let contests = await myQuery(`SELECT * FROM contest WHERE id = ?`, [cid]);

			if (contests.length == 0) {
				let newcontest = {
					'id': 0, 'title': '', 'grade': 1, 'type': 'stu_male', 'rankId': -1, 'season': sid, 'time': web_util.getCurrentDate()
				};

				res.render('contest_edit', {
					contest: newcontest
				})
			} else {
				let contest = contests[0];
				res.render('contest_edit', {
					contest: contest
				})
			}
		}
	} catch (e) {
		console.warn(e);
		res.render('error', { error: e });
	}
})

async function delSearchList(contest) { // Edit the searching data structure
	let cid = parseInt(contest.id);
	let rid = parseInt(contest.rankId);
	let sid = parseInt(contest.season);

	let rankingArr = await myQuery(`SELECT * FROM ranking WHERE id = ?`, [rid]);
	if (rankingArr.length == 0) { console.warn('Ranking not found while id = ', rid); return; }

	let ranking = rankingArr[0].data;
	let str = ranking.split('\n');
	for (let i = 0, index = 0; i < str.length; ++i) {
		let row = str[i];
		let arr = row.split(' ').filter(i => i);
		if (index == 0 || arr[2] != str[i - 1].split(' ').filter(i => i)[2]) ++index;
		// arr[0] is class
		let id_season = arr[0] + '_' + sid;
		let classArr = await myQuery(`SELECT * FROM class WHERE id_season=?`, [id_season]);
		if (classArr.length == 0) { console.warn('Class not found while id = ', arr[0]); return; }

		let newContests = classArr[0].contests.split('|').filter(i => i != cid + '#' + index).join('|');
		if (newContests === '') { // Empty class
			await myQuery(`DELETE FROM class WHERE id_season = ?`, [id_season]);
		} else {
			await myQuery(`UPDATE class SET contests = ? WHERE id_season = ?`, [newContests, id_season]);
		}

		// arr[1] is athlete while type is not stu_union
		if (contest.type !== 'stu_union') {
			let name_class_season = arr[1] + '|' + arr[0] + '_' + sid;
			let athleteArr =
				await myQuery(`SELECT * FROM athlete WHERE name_class_season=?`, [name_class_season]);
			if (athleteArr.length == 0) { console.warn('Athlete not found at ', name_class_season); return; }
			let newContests = athleteArr[0].contests.split('|').filter(i => i != cid + '#' + index).join('|');
			if (newContests === '') { // Empty athlete
				await myQuery(`DELETE FROM athlete WHERE name_class_season = ?`, [name_class_season]);
			} else {
				await myQuery(`UPDATE athlete SET contests = ? WHERE name_class_season = ?`, [newContests, name_class_season]);
			}
		}
	}
}

async function updSearchList(contest) { // Edit the searching data structure
	let cid = parseInt(contest.id);
	let rid = parseInt(contest.rankId);
	let sid = parseInt(contest.season);

	let rankingArr = await myQuery(`SELECT * FROM ranking WHERE id = ?`, [rid]);
	if (rankingArr.length == 0) { console.warn('Ranking not found while id = ', rid); return; }

	let ranking = rankingArr[0].data;
	let str = ranking.split('\n');
	for (let i = 0, index = 0; i < str.length; ++i) {
		let row = str[i];
		let arr = row.split(' ').filter(i => i);
		if (index == 0 || arr[2] != str[i - 1].split(' ').filter(i => i)[2]) ++index;
		// arr[0] is class
		let id_season = arr[0] + '_' + sid;
		let classArr = await myQuery(`SELECT * FROM class WHERE id_season=?`, [id_season]);
		if (classArr.length == 0) {
			await myInsert(`INSERT INTO class(contests,id_season) VALUES(?,?)`, [cid + '#' + index, id_season]);
		} else {
			let tmp = classArr[0].contests.split('|');
			tmp.push(cid + '#' + index);
			await myQuery(`UPDATE class SET contests = ? WHERE id_season = ?`, [tmp.join('|'), id_season]);
		}

		// arr[1] is athlete while type is not stu_union
		if (contest.type !== 'stu_union') {
			let name_class_season = arr[1] + '|' + arr[0] + '_' + sid;
			let athleteArr =
				await myQuery(`SELECT * FROM athlete WHERE name_class_season=?`, [name_class_season]);
			console.log('Pinyin is', arr[1]);
			let abbr = pinyin(arr[1], { style: "FIRST_LETTER" }).map(x => x[0]).join('');
			console.log(abbr);
			if (athleteArr.length == 0) {
				await myInsert(`INSERT INTO athlete(contests,abbr,name_class_season) VALUES(?,?,?)`, [cid + '#' + index, abbr, name_class_season]);
			} else {
				let newContests = athleteArr[0].contests.split('|').push(cid + '#' + index).join('|');
				await myQuery(`UPDATE athlete SET contests=?,abbr=? WHERE name_class_season = ?`,
					[newContests, abbr, name_class_season]);
			}
		}
	}
}

router.post('/:sid/contest/:cid/edit', async (req, res) => {
	try {
		res.setHeader('Content-Type', 'application/json');
		let user = req.user;
		if (!user)
			throw 3001; // 未经授权
		else {
			let sid = parseInt(req.params.sid);
			let cid = parseInt(req.params.cid);
			let seasonArr = await myQuery(`SELECT * FROM season WHERE id = ?`, [sid]);
			if (seasonArr.length == 0) {
				throw 3002; // 赛季不存在
			} else {
				let contest = req.body;
				if (contest.title.length == 0) throw 3003; // 标题无效

				try {
					contest.time = web_util.parseDate(contest.time);
				} catch (e) {
					throw 3014; // 时间格式错误
				}

				let contestArr = await myQuery(`SELECT * FROM contest WHERE id = ?`, [cid]);
				if (contestArr.length == 0) {
					contest.rankId = await myInsert(
						`INSERT INTO ranking(data) VALUES(?)`, [
						contest.ranking
					]);

					contest.id = await myInsert(
						`INSERT INTO contest(title, grade, type, time, rankId, season) VALUES(?,?,?,?,?,?)`, [
						contest.title, contest.grade, contest.type, contest.time, contest.rankId, parseInt(contest.season)
					]);
					await updSearchList(contest);
					res.send(JSON.stringify({ error_code: 1, contest_id: contest.id }));

				} else {
					await delSearchList(contestArr[0]);

					await myQuery(
						`UPDATE ranking SET data = ? WHERE id = ?`, [
						contest.ranking, contest.rankId
					]);
					await myQuery(
						`UPDATE contest SET title=?,grade=?,type=?,season=? WHERE id=?`, [
						contest.title, contest.grade, contest.type, contest.season, cid
					]);
					await updSearchList(contest);
					res.send(JSON.stringify({ error_code: 1, contest_id: contest.id }));

				}
			}
		}
	} catch (e) {
		res.send(JSON.stringify({ error_code: e, detail: e.message }));
	}
})

router.get('/:sid/search', async (req, res) => {
	try {
		let sid = parseInt(req.params.sid);
		let seasons = await myQuery(`SELECT * FROM season WHERE id = ?`, [sid]);

		if (seasons.length == 0) throw '赛季不存在';

		if (req.query.dataOnly) {
			let athletes = await myQuery(`SELECT * FROM athlete WHERE name_class_season LIKE '%\\_${sid}%'`);
			let classes = await myQuery(`SELECT * FROM class WHERE id_season LIKE '%\\_${sid}%'`);
			res.json({
				athletes: athletes,
				classes: classes
			});
		} else {
			res.render('search');
		}
	} catch (e) {
		console.warn(e);
		res.render('error', { error: e });
	}
})

/*
router.post('/:sid/search', async (req, res) => {
	try {
		res.setHeader('Content-Type', 'application/json');
		let user = req.user;
		if (!user)
			throw 3001; // 未经授权

		let sid = parseInt(req.params.sid);
		let { error1, results1, fields1 } = await connection.query(`SELECT * FROM season WHERE id = ?`, [sid]);
		if (error1) throw error1;
		if (results1.length == 0)
			throw 3002; // 赛季不存在

		let data = req.body.data;
		let { error2, results2, fields2 } = await connection.query(`SELECT * FROM class`);
		if (error2) res.send(JSON.stringify({ error_code: 3003, detail: error2 }));
		let res_class = results2.map(x => x.id_season)
			.filter(x => x.split('|')[0].includes(data) && x.split('|')[1] === sid);

		let { error3, results3, fields3 } = await connection.query(`SELECT * FROM athlete`);
		if (error2) res.send(JSON.stringify({ error_code: 3003, detail: error2 }));

		let res_athlete1 = results3.map(x => x.name_class_season)
			.filter(x => x.split('|')[0].includes(data) && x.split('|')[2] === sid);

		let res_athlete2 = results3.filter(x => x.abbr.includes(data)).map(x => x.name_class_season);
		res.send(JSON.stringify({
			error_code: 1,
			res_class: JSON.stringify(res_class),
			res_athlete1: JSON.stringify(res_athlete1),
			res_athlete2: JSON.stringify(res_athlete2)
		}));
	} catch (e) {
		console.warn(e);
		res.send(JSON.stringify({ error_code: e }));
	}
})
*/

//导出路由对象
module.exports = router;