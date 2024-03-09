const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

let db

const dbpath = path.join(__dirname, 'twitterClone.db')

const initializer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error : ${e.message}`)
  }
}

initializer()

// API - 1 REGISTERING THE USER INTO TWITTER

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const sql = `
    SELECT * FROM user WHERE username = '${username}';
    `
  const hashedPassword = await bcrypt.hash(password, 10)
  const data = await db.get(sql)
  if (data == undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const userinfo = `
            INSERT INTO user (username , password , name , gender)
            VALUES ('${username}' , '${hashedPassword}' , '${name}' , '${gender}');
            `
      await db.run(userinfo)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API-2 LOGING IN THE USER INTO TWITTER

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  let jwtToken
  const sql = `
  SELECT * FROM user WHERE username = '${username}';
  `
  const data = await db.get(sql)
  if (data === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const passwordMatched = await bcrypt.compare(password, data.password)
    if (passwordMatched == true) {
      jwtToken = jwt.sign(data, 'randomnumber43028')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// middlewear function

const auther = (request, response, next) => {
  const {tweetId} = request.params
  const {tweet} = request.body
  let jwtToken
  const autherHead = request.headers['authorization']
  if (autherHead != undefined) {
    jwtToken = autherHead.split(' ')[1]
  }
  if (jwtToken == undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'randomnumber43028', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.tweetId = tweetId
        request.tweet = tweet
        request.payload = payload
        next()
      }
    })
  }
}

// API-3 TO GET LATEST 4 FEEDS OF user

app.get('/user/tweets/feed/', auther, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(payload)
  const sql = `
  SELECT  
      tweet.tweet , user.username, tweet.date_time as dateTime
  FROM 
      follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE  
      follower.follower_user_id = ${user_id}
  ORDER BY 
      date_time DESC
  LIMIT 4 
 ;
  `
  const data = await db.all(sql)
  response.send(data)
})
//API - 4

app.get('/user/following/', auther, async (request, response) => {
  const {username, user_id} = request

  const sql = `
  SELECT name  FROM user JOIN follower ON user.user_id = follower.follower_user_id 
  WHERE 
     follower.follower_user_id = '${user_id}'
  ;
  `
  const data = await db.all(sql)
  response.send(data)
})

// API-5
app.get('/user/followers/', auther, async (request, response) => {
  const {payload} = request
  const {username, user_id, name, gender} = payload
  const sql = `
  SELECT 
      name 
  FROM 
      user INNER JOIN follower ON follower.following_user_id = user.user_id
  WHERE 
    follower.follower_user_id = ${user_id};`
  const data = await db.all(sql)
  response.send(data)
})
//API-6
app.get('/tweets/:tweetId/', auther, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {username, name, user_id, gender} = payload
  const query = `
   SELECT * FROM tweet WHERE tweet_id = ${tweetId} 
   `
  const data = await db.get(query)
  const follow = `
   SELECT * 
   FROM 
        follower INNER JOIN user ON user.user_id = follower.following_user_id
   WHERE 
        follower.follower_user_id = ${user_id}
   `
  const info = await db.get(follow)
  if (info.some(item => item.following.user_id == data.user_id)) {
    const getTweet = `
    SELECT 
      tweet ,
      COUNT(DISTINCT(like.like_id)) AS likes,
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
    FROM  tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE
      tweet.tweet_id = ${tweetId} AND tweet.user_id = ${info[0].user_id}
      ;
    `
    const tweetDetails = await db.get(getTweet)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})
//API-7

app.get('/tweets/:tweetId/likes/', auther, async (request, response) => {
  const {payload} = request
  const {usename, user_id, name, gender} = payload
  const {tweetId} = request
  const getlikedUsersQuery = `
  SELECT * FROM follower INNER JOIN tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
  INNER JOIN user ON user.user_id = like.user_id
  WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id}
  `
  const likedUsers = await db.all(getlikedUsersQuery)
  if (likedUsers.length != 0) {
    let likes = []
    const getNamesArray = likedUsers => {
      for (let item of likedUsers) {
        likes.push(item.username)
      }
    }
    getNamesArray(likedUsers)
    response.send({likes})
  } else {
    response.send('Invalid Request')
  }
})

//API - 8

app.get('/tweets/:tweetId/replies', auther, async (request, response) => {
  const {payload} = request
  const {tweetId} = request
  const {user_id, username, name, gender} = payload
  const getRepliedUserQuery = `
  SELECT * 
  FROM 
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = reply.user_id
  WHERE 
    tweet.tweet_id = ${tweetId} AND follower_user_id = ${user_id};
  `
  const repliedUsers = await db.all(getRepliedUsersQuery)
  if (repliedUsers.length != 0) {
    let replies = []
    const getNamesArray = repliedUsers => {
      for (let item of repliedUsers) {
        let object = {
          name: item.name,
          reply: item.reply,
        }
        replies.push(object)
      }
    }
    getNamesArray(repliedUsers)
    response.send({replies})
  } else {
    response.send('Invalid Request')
  }
})

//API - 9

app.get('/user/tweets/', auther, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, username, name, gender} = payload
  const getTweetDetailsQuery = `
  SELECT tweet.tweet AS tweet , 
  COUNT(DISTINCT(like.like_id)) AS likes,
  COUNT(DISTINCT(reply.reply_id)) AS replies ,
  tweet.date_time AS dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN replY ON reply.tweet_id = tweet.tweet_id
  WHERE user.user_id = ${user_id}
  GROUP BY 
  tweet.tweet_id
  ;`
  const tweetsDetails = await db.all(getTweetDetailsQuery)
  response.send(tweetsDetails)
})

//API - 10

app.post('/user/tweets/', auther, async (request, response) => {
  const {tweet} = request
  const {payload} = request
  const {tweetId} = request
  const {username, user_id, name, gender} = payload
  const postTweetQuery = `
  INSERT INTO tweet (tweet , user_id)
  VALUES ('${tweet}',${user_id})
  ;`
  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

//API - 11

app.delete('/tweets/:tweetId', auther, async (request, response) => {
  const {payload} = request
  const {tweet} = request
  const {tweetId} = request
  const {username, name, user_id, gender} = payload
  const selectUserQuery = `
  SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId} AND tweet.tweet_id = ${tweetId}
;`
  const tweetUser = await db.all(selectUserQuery)
  if (tweetUser.length != 0) {
    const deleteTweet = `
  DELETE FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId}
  ;`
    await db.run(deleteTweet)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
