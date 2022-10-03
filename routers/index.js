const Register = require('./register');
const Login = require('./login');
const Season = require('./season');
const url = require("url");
const fs = require("fs");
let md = require('markdown-it')();


module.exports = async (app) => {

	app.get('/', async (req, res) => {
		try {
			let dat = await myQuery(`SELECT * FROM season ORDER BY season.id DESC`);
			await dat.forEachAsync(async r => {
				r.content =
					md.render(r.content)
						.replace('<table>', '<table class="ui very basic unstackable table">');
				let contests = await myQuery(`SELECT * FROM contest WHERE season = ?`, [r.id]);
				r.contest_len = contests.length;
			})

			res.render("index", {
				seasons: dat
			});
		} catch (e) {
			console.warn(e);
			res.render('error', { error: e });
		}
	});


	app.get('/queryContest/:cid', async (req, res) => {
		try {
			let cid = parseInt(req.params.cid);
			let contests = await myQuery(`SELECT * FROM contest WHERE id = ?`, [cid]);
			if (contests.length == 0) throw 'Contest not found.';
			else res.send(contests[0]);
		} catch (e) {
			console.warn(e);
			res.json({ error: e });
		}
	})

	app.use('/registerPage', Register);
	app.use('/loginPage', Login);
	app.use('/season', Season);
}