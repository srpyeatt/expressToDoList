/*
Author: Shelbie Pyeatt
Date: 11/17/2023
Description: Simple To-Do calendar program utilizing promises with a simple SQLite Database with Express
*/

// Console Log to print
const print = console.log;

// Library Imports
import express from 'express'
import {engine} from 'express-handlebars'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import bcrypt from 'bcrypt'
import cookieParser from 'cookie-parser'
import { v4 as uuidv4 } from 'uuid'

// Database Set-Up
const dbPromise = open ({
    filename: './database/todolist.sqlite',
    driver: sqlite3.Database
});

// Express & Port Set-Up
const app = express()
const saltRounds = 10
const port = 8080
app.use(express.urlencoded({ extended: false }));

// Static Folder Set-Up
app.use('/static', express.static('./static'));

// Handlebar Engine Set-Up
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');

// Cookie Parser Set-Up
app.use(cookieParser());

// Port Display
app.listen(port, () => {
    console.log(`Server started on port: ${port}`);
})

// GET Handlers
app.get("/", (req, res) => {
    if (!req.user)
    {
        return res.redirect('/login');
    }

    res.render('home', { tasks: req.tasks, user: req.user });
})

app.get("/login", (req, res) => {
    res.render("login");
})

app.get("/register", (req, res) => {
    res.render("register");
})

app.get("/logout", (req,res) => {
    res.clearCookie("authToken");
    res.redirect("/login");
})

app.get("/home", (req, res) => {
    res.render('home', { tasks: req.tasks, user: req.user });;
})

// POST Handlers
// Method to register user with username and password confirmation
app.post("/register", async (req,res) => {
    const username = req.body.username;
    const password = req.body.password;
    const passwordCheck = req.body.passwordCheck;
    const db = await dbPromise;

    if (!username || !password || !passwordCheck) {
        return res.render('register', { error: 'All fields are required' });
    }

    if (password !== passwordCheck)
    {
        return res.render('register', { error: 'Passwords must match' });
    }

    try
    {
        const hashPass = await bcrypt.hash(password, saltRounds);
        const result = await db.run('INSERT INTO users (username, password) VALUES (?, ?);', [username, hashPass]);
        
        const userId = result.user_id;
        const authToken = uuid4();

        await db.run('INSERT INTO authtokens (user_id, token) VALUES (?, ?);', [userId, authToken]);
        res.cookie("authToken", authToken);
    }
    catch (err)
    {
        print('Error during registration:', error);
        res.status(500).send('Internal Server Error');
    }

    res.redirect("/login");
})

// Authentication Set-Up
const authenticateMiddleware = async (req, res, next) => {
    print(req.cookies);
    if (!req.cookies || !req.cookies.authToken)
    {
        print("Oops?");
        return next();
    }

    const db = await dbPromise;
    try 
    {
        print("trying");
        const token = await db.get("SELECT * FROM authtokens WHERE token=?", req.cookies.authToken);
        if (token)
        {
            const user = await db.get("SELECT user_id, username FROM users WHERE user_id=?", token.user_id);
            req.user = user;
        }
        next();
    }
    catch (err)
    {
        print("Bad token error");
        print(err);
        return next();
    }
}
app.use(authenticateMiddleware);

// Method to login user based off username and password
app.post("/login", async (req, res) => {
    const db = await dbPromise;
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) 
    {
        return res.send('All fields are required');
    }

    try 
    {
        const user = await db.get("SELECT * FROM users WHERE username=?", username);
        if (!user)
        {
            return res.send('Error: username or password incorrect');
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch)
        {
            return res.send('Error: username or password incorrect');
        }

        const authToken = uuidv4();
        await db.run(
            "INSERT INTO authtokens (token, user_id) VALUES (?,?);",
            authToken,
            user.user_id
        );
        res.cookie("authToken", authToken);
        print(req.user);
    } 
    catch (err)
    {
        print('Error during login:', error);
        res.status(500).send('Internal Server Error');
    }

    res.redirect("/home");
})

// Method to display the tasks on the 'Task' page
app.get("/tasks", async (req, res) => {
    let user_id = req.cookies.user_id;
    const db = await dbPromise;

    let taskList_Query = `SELECT * FROM tasks WHERE user_id = "${user_id}";`
    let taskList_Result = await db.all(taskList_Query);

    let taskList = [];
    for (item of taskList_Result)
    {
        let taskInfo_Query = `SELECT * FROM tasks WHERE task_id = "${item.task_id}";`
        let result = await db.get(taskInfo_Query)
        if (result)
        {
            taskList.push(result)
        }
    }

    let userQuery = `SELECT username FROM users WHERE user_id="${user_id}";`
    let user = await db.get(userQuery);

    res.render("tasks", {layout: false,
        "username": user.username,
        "tasks": taskList
    });
})

// Adds in the task description given by the user
app.post('/add_task', async (req,res) => {
    let description = req.body.task_desc;
    let user = req.cookies.user_id;
    const db = await dbPromise;

    let query = `INSERT INTO tasks (user_id, task_desc, is_complete) VALUES ("${user}","${description}","0")`;
    let result = await db.run(query);

    if (result)
    {
        print(`Task Created`);
        res.redirect('/tasks');
    }
    else 
    {
        res.send("Cannot Enter Task")
    }
})

// Marks user given task as complete
app.post('/mark_complete', async (req,res) => {
    let taskID = req.body.task_id;
    let user = req.cookies.user_id;
    const db = await dbPromise;

    let query = `UPDATE tasks SET is_complete = 1 WHERE task_id = "${taskID}" AND user_id = "${user}"`;
    let result = await db.run(query);

    if (result)
    {
        print(`Task Marked Complete`);
        res.redirect('/tasks');
    }
    else 
    {
        res.send("Cannot Change Task")
    }
})

// Marks user given task as incompleted
app.post('/mark_incomplete', async (req,res) => {
    let taskID = req.body.task_id;
    let user = req.cookies.user_id;
    const db = await dbPromise;

    let query = `UPDATE tasks SET is_complete = 0 WHERE task_id = "${taskID}" AND user_id = "${user}"`;
    let result = await db.run(query);

    if (result)
    {
        print(`Task Marked Incomplete`);
        res.redirect('/tasks');
    }
    else 
    {
        res.send("Cannot Change Task")
    }
})