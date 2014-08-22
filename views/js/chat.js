var MySessionID = 99999;
function chat_module()
{
	var IsNeedReconnect = false;
	var focusHandle = 0;
	var blurHandle = 0;
	var WebMsgType = {
		AUTH : "auth",
		CHAT : "chat",
		WCHAT: "wchat",
		WHISPER: "whisper",
		STATUS: "status"
	};

	var WebMsg = function (sessionid, type, data) {
		this.SessionID = sessionid;
		this.Name = '';
		this.Type = type;
		this.Data = data;
	};

	var connection = 0;

	// Define Dom elements
	var dom = {
        chatArea: "chatarea",
		chatSend: "chatsend",
		chatinput: "chatinput",
		chatUsers: "chatusers",
        get: function( szID ){
                return $('#'+szID);
        }
	};
    
    function getServerEndpoint(callback) {      
        $.ajax({
            type: "GET",
            url: "/koi/chat/endpoint",
        })
        .done(
            function( address ){
                callback(address);
            }
        );
    }
	
	function initConnection(address)
	{
		connection = new WebSocket(address)
		// When the connection is open, send some data to the server
		connection.onopen = function () {
			//connection.send('Ping'); // Send the message 'Ping' to the server
			
			var packet = MakePacket(MySessionID,WebMsgType.AUTH,"");
			SendMessage(packet);
			
			console.log("Connection Open");
			addRowToTable('chatarea', 'Connected to Server');
			IsNeedReconnect = false;
			refreshChatScroll();
		};

		// Log errors
		connection.onerror = function (error) {
			console.log('WebSocket Error ' + error);
		};

		// Log messages from the server
		connection.onmessage = function (ws) {
			var jsonPacket = ws.data;
			console.log(jsonPacket);
			try {
				var packet = $.parseJSON( jsonPacket );
				
				if (packet.Type == 'chat') {
					//addRowToTable('chatarea', packet.Data)
					createChatMsg($('#chatarea'), packet.Name, packet.Data, packet.Timestamp);
					refreshChatScroll();
					if ( !document.hasFocus() && packet.Name != MyUserName) {
						drawNotification(packet.Name, packet.Data);
					}				
				}
				if (packet.Type == 'whisper') {
					//row = addRowToTable('chatarea', packet.Name + " Whispers >> " + packet.Data.Msg);
					row = createChatMsg($('#chatarea'), packet.Name, packet.Data.Msg, packet.Timestamp);
					var text = row.children().css( 'color', '#FFFFFF' );
					
					row.mouseover(function (e) {
						console.log('is over');
						$(this).children().css( 'color', 'orange');
					});
					row.mouseout(function (e) {
						console.log('is out');
						$(this).children().css( 'color', '#FFFFFF');
					});
					
					row.click(function (e) {
						console.log('revealed');
						var $row = $(this);
						$row.children().css('color', 'green');
						$row.unbind('mouseover');
						$row.unbind('mouseout');
					});
					
					refreshChatScroll();
					
					
					if ( !document.hasFocus() && packet.Name != MyUserName)
					{
						drawNotification(packet.Name, 'Send you a secret whisper, hover/click to uncover the secret');
					}				
					
					
				}			
				else if (packet.Type == 'users')
				{
					var userlist = packet.Data;
					
					var chatUsers = dom.get( dom.chatUsers );
					var chatMode = $('#select-user');
					chatUsers.empty();
					chatMode.empty();
					
					addChatMode('Global');
					
					for (var i in userlist) {
						row = addRowToTable('chatusers', userlist[i]);
						row.removeClass();
						row.toggleClass('warning');
						
						addChatMode(userlist[i]);
					}
					
					// rebind chat listeners after changing elements
					bindChatModeListener();
			
				}
				else if (packet.Type == 'status') {
					console.log('setting status for ' + packet.Name);
					var userTr = $( "#chatusers tr:contains('" + packet.Name + "')" );
					if (packet.Data == 'away') {
						userTr.removeClass();
						userTr.toggleClass('warning');
					}
					else if (packet.Data == 'online') {
						userTr.removeClass();
						userTr.toggleClass('success');
					}
				}
				else if (packet.Type == 'history') {
					
					try {
						console.log("History Packet is HERE");
						console.log(packet.Data);
						var split_lines = packet.Data;
						var len = split_lines.length;
						for ( var index in split_lines) {
							var pckData = $.parseJSON( split_lines[index] );
							
							console.log(pckData);
							
							//row = addRowToTable('chatarea', pckData.Data);
							row = createChatMsg($('#chatarea'), pckData.Name, pckData.Data, pckData.Timestamp);
							var text = row.children().css( "color", "#D0D0D0" );
							
							refreshChatScroll();
						}

					} catch (e) {
						console.log("Error Parsing History json");
					}
					
				
				}
				
			} catch(e) {
				console.log("Malform Json");
			}

			

		};
		
		connection.onerror = function(ws)
		{
			var chatArea = $('#chattable');
			var chatUsers = dom.get( dom.chatUsers );
			//chatArea.empty();
			chatUsers.empty();
			
			addRowToTable('chatarea', 'Connection to Server Error');
			
			IsNeedReconnect = true;
			
			connection.close();
			//Reconnect();
			
			console.log("Connection Error");
			
		}
		
		connection.onclose = function(ws)
		{
			var chatArea = $('#chatarea');
			var chatUsers = dom.get( dom.chatUsers );
			//chatArea.empty();
			chatUsers.empty();
			
			addRowToTable('chatarea', 'Connection to Server Closed Unexpectedly');
			
			IsNeedReconnect = true;
			
			connection.close();
			Reconnect();
			
			console.log("Connection Closed");
		}
		
	}

	function Reconnect() {
		setTimeout(function(){
			console.log("Reconnecting");
			location.reload(true);
            getServerEndpoint(initConnection);
			
		},5000);
	}

	function DoChat()
	{
		var chatinput = dom.get( dom.chatinput );
		
		var szMode = $('#select-curr').text();
		console.log(typeof(szMode));
		console.log(szMode);
		
		if (chatinput.val().length > 0) {
			var packet = 0;
			if (szMode === 'Global') {
				packet = MakePacket(MySessionID,WebMsgType.CHAT,chatinput.val());
			}
			else {
				var payload = {
					'ToPlayer': szMode,
					'Msg' : chatinput.val()
				};
				packet = MakePacket(MySessionID,WebMsgType.WHISPER, payload);
				
				row = addRowToTable('chatarea', "You Whisper to " + szMode + " >> " + chatinput.val());
				
				var text = row.children().css( "color", "green" );
				
				if ( $('#id_privacy:checked').val() == 'privacy' ){
					row.fadeOut(1000);
				}
				
				refreshChatScroll();
			}
			
			SendMessage(packet);
			chatinput.val('');	
		}	
	}

	function bindChatModeListener()
	{
		$('#select-user li a').click(function(e) {
			var $curr = $(this);
			console.log($curr.text());
			$('#select-user li.active').removeClass('active');
			var $li = $curr.parent();
			$li.addClass('active');
			
			$('#select-curr').text($curr.text());
			
			e.preventDefault();
		});			
	}

	function addChatMode(szName)
	{
		//if (szName != MyUserName) 
		{
			var chatMode = $('#select-user');
			var li = $('<li>');
			var a = $('<a>');
			//a.attr('href', '');
			a.text(szName);
			li.append(a);
			chatMode.append(li);	
		}
	}

	function SendMessage(szMsg)
	{
		connection.send(szMsg);
	}

	function MakePacket(sessionid, Type, data)
	{	
		var packet = new WebMsg(sessionid,Type, data);
		return JSON.stringify(packet);
	}


	function addRowToTable()
	{
		var szDomName = arguments[0];

		var table = $('#'+szDomName);
		var tableRow = $('<tr>');
		
		//console.log("Arguments: " + arguments[1]);
		for (var i = 1; i < arguments.length; i++) {
			var col = $('<td>');
			col.append( arguments[i] );
			tableRow.append( col );
		}

		table.append( tableRow );
		
		return tableRow;
	}

	function drawNotification(name, msg)
	{
		if (Notification.permission == "granted") {
			var note = new Notification(
				name + " Says, ", {
					body: msg,
					icon: 'res/kt80x80.jpg'
			});	
			
			note.onshow = function() { 
				// automatically dismisses the notification after 3s
				console.log("onDisplay");
				setTimeout( function() { note.close() }, 3000 ); 
			};
			
			note.onclose = function() { 
				console.log("onClose"); 
			};
			
			note.onclick = function() {
				window.focus();
				console.log('onClick');
				note.close();
			};
			
			note.show();
		}
		else {
			Notification.requestPermission();
		}
	}

	function refreshChatScroll() {
		var chatArea = $('#chattable');	
		chatArea.scrollTop(chatArea[0].scrollHeight);
	}

	function createChatMsg(chatBox, username, msg, unixtime)
	{
		// top level
		var $chatcol = $('<div>');
		
		var $header = $('<div>');
		$header.addClass('row');

		
		// user name 
		var $user = $('<div>');
		$user.addClass("col-md-8");
		
		var html = "<h4>" + username + " <small>says</small></h3>";
		$user.append(html);
		
		// timestamp
		var $time = $('<div>');
		$time.addClass("col-md-4");
		
		var timestamp = moment(parseInt(unixtime)).tz("Asia/Singapore").format('MMM Do, h:mm a');
		$time.text(timestamp);
		
		// msg
		var $body = $('<div>');
		$body.addClass("row");
		
		var $msg = $('<div>');
		$msg.addClass("col-md-12");
		$msg.append(msg);
		
		$body.append($msg);
		
		$header.append($user);
		$header.append($time);
		
		$chatcol.append($header);
		$chatcol.append($body);
		
		var $table = $(chatBox);
		var $tablerow = $('<tr>');
		$table.append( 
			$tablerow.append( 
				$('<td>').append( $chatcol ) 
		));
		
		return $tablerow;
	}
	
	// bind events
	var chatSend = dom.get( dom.chatSend );
	chatSend.click(function() {
		DoChat();
	});
	
	
	dom.get(dom.chatinput).keypress(function(e) {
		var code = e.keyCode || e.which;
		if(code == 13) { // 'Enter' keycode
			console.log( "Handler for .keypress() called." );
			DoChat();
		}
	});
	
	$(document).keypress(function(e) {
		var code = e.keyCode || e.which;
		if(code == 9) { // 'Tab' keycode
			dom.get(dom.chatinput).focus();
		}
	});
	if (Notification.permission != "granted") {
		$('#show_button').show();
		$('#show_button').click(function(e) {
			//window.webkitNotifications.requestPermission();
			console.log("Request Permission");
			Notification.requestPermission( function(status) {
				console.log(status); // notifications will only be displayed if "granted"
			});				
		});				
	}
	else {
		$('#show_button').hide();
	}

	
	$(window).focus(function() {	
		clearTimeout(blurHandle);
		
		var packet = MakePacket(MySessionID,WebMsgType.STATUS, 'online');
		SendMessage(packet);			
	});

	$(window).blur(function() {	
		clearTimeout(focusHandle);
		
		var packet = MakePacket(MySessionID,WebMsgType.STATUS, 'away');
		SendMessage(packet);		
	});				
	
	$('#channel-tab a').click(function (e) {
		e.preventDefault()
		$(this).tab('show')
		console.log("tabbing");
	});
	
	var first = $('#select-user li').index(0);
	console.log(first);
	
    // Connect to chat server
	console.log( "Chat initialize");
    getServerEndpoint(initConnection);
    
} // ---- END chat_module 

chat_module();