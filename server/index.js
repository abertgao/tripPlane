import {resolve,isAbsolute} from 'node:path'
import {createApp} from './app.js'
import {checkProviderConfig} from './provider.js'
const directory=process.env.SHANHE_DATA_DIR,origin=process.env.SHANHE_ORIGIN
if(!directory||!isAbsolute(directory)||!origin)throw new Error('SHANHE_DATA_DIR and SHANHE_ORIGIN are required')
checkProviderConfig()
const {app,db}=createApp({dbPath:resolve(directory,'journal.sqlite'),origin})
const server=app.listen(8813,'127.0.0.1',()=>console.log('Shanhe API ready on loopback'))
function stop(){server.close(()=>{db.close();process.exit(0)})}
process.on('SIGTERM',stop);process.on('SIGINT',stop)
