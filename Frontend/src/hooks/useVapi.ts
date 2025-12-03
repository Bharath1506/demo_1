import { useState, useEffect, useCallback, useRef } from 'react';
import { getVapiInstance } from '@/services/vapiService';

export interface VapiMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    speaker?: string; // Name of the speaker (Employee, Manager, or Tara)
}

export const useVapi = () => {
    const [isCallActive, setIsCallActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [messages, setMessages] = useState<VapiMessage[]>([]);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [currentSpeaker, setCurrentSpeaker] = useState<string>('Participant');
    const speakerMapRef = useRef<Record<string, string>>({});
    const assignedRolesRef = useRef<string[]>([]);

    const vapi = getVapiInstance();

    useEffect(() => {
        const onCallStart = () => {
            console.log('Vapi call started');
            setIsCallActive(true);
            setError(null);
            // Reset speaker tracking on new call
            speakerMapRef.current = {};
            assignedRolesRef.current = [];
        };

        const onCallEnd = () => {
            console.log('Vapi call ended');
            setIsCallActive(false);
            setIsSpeaking(false);
        };

        const onSpeechStart = () => {
            console.log('Vapi speech started');
            setIsSpeaking(true);
        };

        const onSpeechEnd = () => {
            console.log('Vapi speech ended');
            setIsSpeaking(false);
        };

        const onMessage = (message: any) => {
            // console.log('Vapi message:', message);

            if (message.type === 'transcript' && message.transcriptType === 'final') {
                let speakerLabel = currentSpeaker;

                // Automatic Speaker Identification logic
                if (message.role === 'user') {
                    const speakerId = message.speakerId ?? message.speaker_id;

                    if (speakerId !== undefined && speakerId !== null) {
                        const sId = String(speakerId);

                        if (!speakerMapRef.current[sId]) {
                            // Assign role based on order of appearance
                            if (!assignedRolesRef.current.includes('Employee')) {
                                speakerMapRef.current[sId] = 'Employee';
                                assignedRolesRef.current.push('Employee');
                            } else if (!assignedRolesRef.current.includes('Manager')) {
                                speakerMapRef.current[sId] = 'Manager';
                                assignedRolesRef.current.push('Manager');
                            } else {
                                speakerMapRef.current[sId] = `Participant ${sId}`;
                            }
                        }
                        speakerLabel = speakerMapRef.current[sId];
                        setCurrentSpeaker(speakerLabel);
                    }
                } else if (message.role === 'assistant') {
                    speakerLabel = 'Tara (HR Assistant)';
                }

                const newMessage: VapiMessage = {
                    role: message.role === 'assistant' ? 'assistant' : 'user',
                    content: message.transcript,
                    timestamp: new Date(),
                    speaker: speakerLabel
                };

                setMessages(prev => {
                    if (prev.length > 0) {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg.role === newMessage.role) {
                            // Check for exact duplicate content or if new content is already at the end
                            const trimmedLast = lastMsg.content.trim();
                            const trimmedNew = newMessage.content.trim();

                            // If the new content is exactly the same as the last message content, ignore it
                            if (trimmedLast === trimmedNew) {
                                return prev;
                            }

                            // If the last message ends with the new content, it might be a duplicate update
                            if (trimmedLast.endsWith(trimmedNew)) {
                                return prev;
                            }

                            // Update the last message
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                ...lastMsg,
                                content: lastMsg.content + ' ' + newMessage.content,
                                timestamp: newMessage.timestamp,
                                speaker: speakerLabel
                            };
                            return updated;
                        }
                    }
                    return [...prev, newMessage];
                });
            }

            if (message.type === 'transcript' && message.transcriptType === 'partial') {
                setTranscript(message.transcript);
            }
        };

        const onError = (error: any) => {
            console.error('Vapi error:', error);
            setError(error.message || 'An error occurred with the voice agent');
        };

        // Attach listeners
        vapi.on('call-start', onCallStart);
        vapi.on('call-end', onCallEnd);
        vapi.on('speech-start', onSpeechStart);
        vapi.on('speech-end', onSpeechEnd);
        vapi.on('message', onMessage);
        vapi.on('error', onError);

        // Cleanup
        return () => {
            vapi.off('call-start', onCallStart);
            vapi.off('call-end', onCallEnd);
            vapi.off('speech-start', onSpeechStart);
            vapi.off('speech-end', onSpeechEnd);
            vapi.off('message', onMessage);
            vapi.off('error', onError);
        };
    }, [vapi]);

    const startCall = useCallback(async () => {
        try {
            console.log('Starting Vapi call with assistant ID...');
            await vapi.start('b971ee04-3880-4638-8b68-ba2a29633583');
        } catch (err: any) {
            console.error('Failed to start call:', err);
            setError(err.message || 'Failed to start call');
        }
    }, [vapi]);

    const stopCall = useCallback(async () => {
        try {
            console.log('Stopping Vapi call...');
            await vapi.stop();
        } catch (err: any) {
            console.error('Failed to stop call:', err);
            setError(err.message || 'Failed to stop call');
        }
    }, [vapi]);

    const sendMessage = useCallback((message: string) => {
        try {
            console.log('Sending message to Vapi:', message);
            vapi.send({
                type: 'add-message',
                message: {
                    role: 'user',
                    content: message
                }
            });

            // Add to local messages immediately
            const newMessage: VapiMessage = {
                role: 'user',
                content: message,
                timestamp: new Date(),
                speaker: currentSpeaker
            };

            setMessages(prev => [...prev, newMessage]);
        } catch (err: any) {
            console.error('Failed to send message:', err);
            setError(err.message || 'Failed to send message');
        }
    }, [vapi, currentSpeaker]);

    const setSpeaker = useCallback((speakerName: string) => {
        setCurrentSpeaker(speakerName);
    }, []);

    return {
        isCallActive,
        isSpeaking,
        messages,
        transcript,
        error,
        currentSpeaker,
        startCall,
        stopCall,
        sendMessage,
        setSpeaker
    };
};
