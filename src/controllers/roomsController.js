import Attendee from '../entities/attendee.js'
import Room from '../entities/room.js'
import { constants } from '../util/constants.js'
import CustomMap from '../util/customMap.js'

export default class RoomsController {
    #users = new Map()
    constructor ({roomsPubSub}) {
        this.roomsPubSub = roomsPubSub
        this.rooms = new CustomMap({
            observer : this.#roomObserver(),
            customMapper : this.#mapRoom.bind(this)
        })

    } 

    #roomObserver() {
        return {
            notify : rooms => this.notifyRoomSubscribers(rooms)
        }
    }

    speakAnswer(socket, { answer, user}) {
        const currentUser = this.#users.get(user.id)
        const updatedUser = new Attendee({
            ...currentUser,
            isSpeaker : answer,
        })
    }

    speakRequest(socket) {
        //front  vai mandar evento para falar pro dono que alguém quer falar
        const userId = socket.id
        const user = this.#users.get(userId)
        const roomId = user.roomId
        const owner = this.rooms.get(roomId)?.owner
        socket.to(owner.id).emit(constants.event.SPEAK_REQUEST, user);

    }

    notifyRoomSubscribers(rooms) {
        const event = constants.event.LOBBY_UPDATED
        this.roomsPubSub.emit(event,[...rooms.values()])
    }

    onNewConnection(socket) {
        const  { id } = socket
        console.log("connecion stablished with",id)
        this.#updateGlobalUserData(id)
    }
    disconnect(socket) {
        console.log("disconnected!!", socket.id)
        this.#logoutUser(socket)
    }

    #logoutUser(socket) {
        const userId = socket.id
        const user = this.#users.get(userId)
        const roomId = user.roomId
        //remover user da lista ativa de usuários
        this.#users.delete(userId)

        //caso seja um usuário sujo que estava em uma sala que não existe mais
        if(!this.rooms.has(roomId)) {
            return;
        }

        const room = this.rooms.get(roomId);
        const toBeRemoved = [...room.users].find(({id}) => id === userId)
        room.users.delete(toBeRemoved)

        this.rooms.set(roomId, room)

        if(!room.users.size) {
            this.rooms.delete(roomId)
            return;
        }


        const disconnectedUserWasAnOwner = userId === room.owner.id
        const onlyOneUserLeft = room.users.size === 1

        // validar se o usuário era o dono da sala
        if(onlyOneUserLeft || disconnectedUserWasAnOwner) {
            room.owner = this.#getNewRoomOwner(room,socket)
        }

        // atualizar a room no final
        this.rooms.set(roomId,room)


        // notifica a sala que o usuário se desconectou
        socket.to(roomId).emit(constants.event.USER_DISCONNECTED,user)

    }


    #notifyUserProfileUpgrade(socket, roomId, user) {
        socket.to(roomId).emit(constants.event.UPGRADE_USER_PERMISSION,user)

    }

    #getNewRoomOwner(room, socket) {
        const users = [...room.users.values()]
        const activeSpeakers = users.find(user => user.isSpeaker)

        //se quem desconectou era o dono, passa a liderança para o próximo
        // se n houver speakers, ele pegar o attende mais antigo que e o da primeira posição
        const [newOwner] = activeSpeakers ? [activeSpeakers] : users
        newOwner.isSpeaker = true

        const outdatedUser = this.#users.get(newOwner.id)
        const updatedUser = new Attendee({
            ...outdatedUser,
            ...newOwner,
        })

        this.#users.set(newOwner.id, updatedUser)
        
        this.#notifyUserProfileUpgrade(socket, room.id, newOwner)
        return newOwner

    }


    joinRoom(socket,{ user, room}) {

        const userId =  user.id = socket.id
        const roomId = room.id
        

        const updatedUserData = this.#updateGlobalUserData(
            userId,
            user,
            roomId,

        )

        const updatedRoom = this.#joinUserRoom(socket,updatedUserData,room)
        
        // socket.emit(constants.event.USER_CONNECTED, updatedUserData)
        this.#notifyUsersOnRoom(socket,roomId,updatedUserData)

        this.#replyWithActiveUsers(socket,updatedRoom.users)
            
    } 

    #replyWithActiveUsers(socket,users) {
        const event = constants.event.LOBBY_UPDATED
        socket.emit(event,[...users.values()])
    }

    #notifyUsersOnRoom(socket,roomId,user ) {
        const event = constants.event.USER_CONNECTED
        socket.to(roomId).emit(event,user)
        
    }

    #joinUserRoom(socket,user,room) {
        const roomId = room.id
        const existingRoom = this.rooms.has(roomId)
        const currentRoom = existingRoom ? this.rooms.get(roomId) : {}
        const currentUser = new Attendee({
            ...user,
            roomId,
        })

        // definir quem é o dono da sala
        const [owner, users] = existingRoom ? 
            [ currentRoom.owner, currentRoom.users] :
            [ currentUser, new Set()]

        const updatedRoom = this.#mapRoom({
            ...currentRoom,
            ...room,
            owner,
            users : new Set([...users, ...[currentUser]])
        })

        this.rooms.set(roomId, updatedRoom)

        socket.join(roomId)

        return this.rooms.get(roomId)
        
    }

    #mapRoom(room) {
        const user = [...room.users.values()]
        const speakersCount = user.filter(user => user.isSpeaker).length
        const featuredAttendees = user.slice(0,3)
        const mappedRoom = new Room({
            ...room,
            featuredAttendees,
            speakersCount,
            attendeesCount : room.users.size
        })

        return mappedRoom
    }

    #updateGlobalUserData(userId, userData = {}, roomId = '') {
        const user = this.#users.get(userId) ?? {} 
        const existingRoom = this.rooms.has(roomId)

        const updatedUserData = new Attendee({
            ...user,
            ...userData,
            roomId,
            //se for a único na sala
            isSpeaker : !existingRoom,
        })
        this.#users.set(userId,updatedUserData)

        return this.#users.get(userId)
    }

    getEvents() {
        const functions = Reflect.ownKeys(RoomsController.prototype)
            .filter(fn => fn !== 'constructor')
            .map(name => [name, this[name].bind(this)]);


        return new Map(functions);
            /*
            */
    }
}