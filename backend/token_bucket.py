import time
class TokenBucket:
    def __init__(self,capacity,refill_rate):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity        #itsays intially bucket is full
        self.last_time = time.monotonic()        # it will store the time when bucket is initialised\
    def refill(self):
        now = time.monotonic()   # give curent time
        elapsed = now - self.last_time        #seconds passed since the previous refill
        
        tokens_to_add = elapsed * self.refill_rate
        
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)  ############ it will prevent exceding the maximum capacity
        
        self.last_time = now
    
    def allow_request(self):
        self.refill()
        if self.tokens >= 1:       #cheking if we have enough tokens to allow req 
            self.tokens = self.tokens - 1            # if we have then we are consuming one and returning true
            return True
        return False       # if we dont have enough tokens it will reject

if __name__ == "__main__":
    # Create a bucket holding 3 tokens, refilling 1 per second
    bucket = TokenBucket(3, 1)

    # Send 3 requests to consume all available tokens
    for i in range(3):

        # Check whether each request is allowed
        result = bucket.allow_request()

        # Print the decision
        print("Request:", i + 1, "Allowed:", result)

    # Wait 2 seconds to allow tokens to refill
    time.sleep(2)

    # Send another request after waiting
    result = bucket.allow_request()

    # Display whether the new request was allowed
    print("Request after waiting:", result)
