## Init
Ensure you have Node.js (Latest Version) and MySQL installed.

```sh
npm install
```
## Configuration
Open `routers/mysqldb.js` to modify MySQL password.

Login to MySQL console, then
```sql
CREATE DATABASE rateboard;
USE rateboard;
SOURCE rateboard.sql;
```
## Start Preview
```sh
node app.js
```