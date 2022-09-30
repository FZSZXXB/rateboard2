const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const router = require('./routers');
const serializejs = require('serialize-javascript');
const jwt = require('express-jwt');
const jwtSign = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require("fs");
const mysql = require('mysql');
const configPath = './config.json';
const configFile = JSON.parse((fs.existsSync(configPath) && fs.readFileSync(configPath, 'utf-8')) || '{}');

global.JWT_PRIVATE_KEY = configFile.jwt_private_key;
global.web_util = require('./utils');

process.on('unhandledRejection', (reason, p) => {
	console.log('Promise: ', p, 'Reason: ', reason)
	// do something
});

let db_config = {
	host: 'localhost',
	user: configFile.user,
	password: configFile.password,
	database: 'rateboard'
};

global.connection = mysql.createPool(db_config);
//连接数据库
connection.getConnection(function (err, connect) {
	if (err)
		console.warn(`Cannot connect to MySQL. ${err}`);
	else
		console.log(`Get MySQL connection.`);
});

global.myQuery = (str, arr) => {
	console.log(str, arr);
	return new Promise((resolve, reject) => {
		connection.query(str, arr, (err, result) => {
			if (err) { console.log(err); reject(err); }
			else { resolve(result); }
		});
	})
}

global.myInsert = (str, arr) => {
	console.log(str, arr);
	return new Promise((resolve, reject) => {
		connection.query(str, arr, (err, data) => {
			if (err) { console.log(err); reject(err); }
			else { console.log(data.insertId); resolve(data.insertId); }
		});
	})
}

//创建服务应用
let app = express();

//ejs模板引擎配置
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.locals.serializejs = serializejs;
//文件上传
let multer = require('multer');
const { config } = require('process');
const { resourceLimits } = require('worker_threads');
app.multer = multer({ dest: './tmp' });
//静态路径
app.use(express.static(path.join(__dirname, 'public')));
//上传路径
app.use(bodyParser.json());
//接受req.body参数配置
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Use cookie parser
app.use(require('cookie-parser')());
//active
app.use((req, res, next) => {
	res.locals.active = req.path.split('/')[1];
	next();
});

// login
app.use(jwt({
	secret: global.JWT_PRIVATE_KEY,
	algorithms: ['HS256'],
	credentialsRequired: false,
	getToken: (req) => req.cookies.mt_token
}));

app.use((err, req, res, next) => {
	if (err.name === 'UnauthorizedError') {
		next();
	} else {
		next();
	}
});

app.use((req, res, next) => {
	res.locals.req = req;
	res.locals.res = res;
	res.locals.user = req.user;
	let tmp = req.path.split('/');
	if (tmp.length > 1)
		res.locals.seasonId = tmp[2];
	if (req.get('X-PJAX'))
		res.locals.pjax = true;
	else
		res.locals.pjax = false;
	next();
});

//找到routers文件下的index.js导出的函数,传入app
router(app);

app.listen('8002', function () {
	console.log("Website loaded on port 8002.");
})