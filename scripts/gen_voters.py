#!/usr/bin/env python3
import csv, random, os
random.seed(42)
M=["James","Robert","John","Michael","David","William","Richard","Joseph","Thomas","Charles","Christopher","Daniel","Matthew","Anthony","Mark","Donald","Steven","Paul","Andrew","Joshua","Kenneth","Kevin","Brian","George","Timothy","Ronald","Edward","Jason","Jeffrey","Ryan","Jacob","Gary","Nicholas","Eric","Jonathan","Stephen","Larry","Justin","Scott","Brandon","Benjamin","Samuel","Raymond","Gregory","Frank","Patrick","Jack","Dennis","Jerry","Tyler","Aaron","Jose","Nathan","Henry","Douglas","Peter","Zachary","Kyle","Russell","Clyde","Wayne","Roy","Billy","Bobby","Travis","Cody","Wyatt","Colton","Dalton","Dustin","Tanner","Clay","Hank","Wade","Beau","Levi","Caleb","Jesse","Luke","Garrett","Bryce","Tucker","Mason","Logan","Carter","Hunter","Blake","Ethan","Austin","Landon","Riley","Parker","Cooper","Carson","Javier","Miguel","Carlos","Luis","Alejandro"]
F=["Mary","Patricia","Jennifer","Linda","Barbara","Elizabeth","Susan","Jessica","Sarah","Karen","Lisa","Nancy","Betty","Margaret","Sandra","Ashley","Dorothy","Kimberly","Emily","Donna","Michelle","Carol","Amanda","Melissa","Deborah","Stephanie","Rebecca","Sharon","Laura","Cynthia","Kathleen","Amy","Angela","Shirley","Anna","Brenda","Pamela","Emma","Nicole","Helen","Samantha","Katherine","Christine","Debra","Rachel","Carolyn","Janet","Catherine","Maria","Heather","Diane","Ruth","Julie","Olivia","Joyce","Virginia","Victoria","Kelly","Lauren","Christina","Joan","Evelyn","Judith","Andrea","Hannah","Megan","Cheryl","Jacqueline","Martha","Gloria","Teresa","Ann","Sara","Madison","Frances","Kathryn","Janice","Jean","Abigail","Alice","Judy","Sophia","Grace","Denise","Amber","Doris","Marilyn","Danielle","Beverly","Isabella","Theresa","Diana","Natalie","Brittany","Charlotte","Marie","Kayla","Alexis","Lori","Rosa","Elena","Carmen","Lucia","Guadalupe","Sofia"]
LN=["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts","Goodnight","Armstrong","Turner","Phillips","Parker","Evans","Edwards","Collins","Stewart","Morris","Murphy","Cook","Rogers","Morgan","Peterson","Cooper","Reed","Bailey","Bell","Gomez","Kelly","Howard","Ward","Cox","Diaz","Richardson","Wood","Watson","Brooks","Bennett","Gray","James","Reyes","Cruz","Hughes","Price","Myers","Long","Foster","Sanders","Ross","Morales","Powell","Sullivan","Russell","Ortiz","Jenkins","Gutierrez","Perry","Butler","Barnes","Fisher","Trice","Weatherly","Barkley","Collingsworth","Stockton","Paxton","Callahan","Briscoe","Dalhart","McClellan","Childress","Hemphill","Donley","Hutchinson","Whitaker","Mercer","Holloway","Dawson","Pickett","Beaumont","Crockett","Bowie","Travis","Houston","Lockhart","Bonham","Seguin","DeWitt","Fannin","Rusk","Shelby","Hardin","Lamar","Pease","Nolan","Culberson","Kenedy","Kleberg","Rankin","Sterling","Terrell","Midland"]
ST=["Main St","1st St","2nd St","3rd St","4th St","Trice St","Cherry St","Parks St","Willis St","Goodnight St","Vine St","College Ave"]
PA=["Republican"]*60+["Democrat"]*25+["Independent"]*10+["Libertarian"]*5
def nm():
    return (random.choice(M) if random.random()<0.5 else random.choice(F)),random.choice(LN)
def ag():
    return random.randint(35,80) if random.random()<0.6 else random.randint(18,95)
def mk(a,c):
    fn,ln=nm()
    return {"first_name":fn,"last_name":ln,"address":a,"city":c,"state":"TX","zip":"79019","party":random.choice(PA),"age":ag()}
vs=[]
for _ in range(150):
    vs.append(mk(f"{random.randint(100,999)} {random.choice(ST)}","Claude"))
for _ in range(40):
    vs.append(mk(f"{random.randint(1000,28700)} US Hwy 287",random.choice(["Claude","Goodnight","Washburn"])))
for _ in range(30):
    vs.append(mk(f"{random.randint(1000,20700)} State Hwy 207",random.choice(["Claude","Claude","Washburn"])))
for _ in range(30):
    vs.append(mk(f"{random.randint(100,9999)} CR {random.randint(1,30)}",random.choice(["Claude","Goodnight","Washburn"])))
for _ in range(28):
    if random.random()<0.6:
        a=f"{random.randint(100,9999)} RR {random.choice([1151,2272,1258,294,3030,2880,1642,2477])}"
        c=random.choice(["Claude","Goodnight"])
    else:
        a=f"{random.randint(100,9999)} FM {random.choice([1151,2272,1258,294,3030,2880])}"
        c=random.choice(["Claude","Washburn"])
    vs.append(mk(a,c))
random.shuffle(vs)
out=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"data","sample-voters.csv")
with open(out,"w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=["first_name","last_name","address","city","state","zip","party","age"])
    w.writeheader()
    w.writerows(vs)
print(f"Wrote {len(vs)} voters to {out}")
